import { setDeviceFrameLimit } from './device-frame-limit';
import { AuditService } from '../audit/audit.service';
import { recordAdministrationSafely } from '../audit/policies/administration';
import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { ENROLLMENT_LIMITS as L, EnrollmentLimiter } from './enrollment-limits';

export type EnrollmentDeviceType = 'reader' | 'companion';
export interface EnrollmentConnection {
  close(): void;
  readyState: number;
}
export interface EnrollmentRegistration {
  id: number;
  deliver(): Promise<boolean | void>;
  /** Delete only this newly issued registration if it has never authenticated. */
  discard(): Promise<void>;
}
interface Pending {
  socket: EnrollmentConnection;
  type: EnrollmentDeviceType;
  ip: string;
  start: number;
  timer: NodeJS.Timeout;
  code?: string;
  expires: number;
  generation: number;
  state: 'pending' | 'approving' | 'consumed';
  seen: Map<string, number>;
  announcements: number;
  windowStart: number;
  register?: (current: () => boolean) => Promise<EnrollmentRegistration>;
  notify?: (message: string) => void;
}

@Injectable()
export class DeviceEnrollmentService implements OnModuleDestroy {
  constructor(private readonly audit: AuditService) {}
  private readonly pending = new Map<EnrollmentConnection, Pending>();
  private readonly codes = new Map<string, Pending>();
  private readonly limiter = new EnrollmentLimiter();

  admit(socket: EnrollmentConnection, type: EnrollmentDeviceType, ip: string): void {
    const now = performance.now();
    this.limiter.take('connection:global', L.connections, now);
    this.limiter.take(`connection:ip:${ip}`, L.connectionsPerIp, now);
    if (
      this.pending.size >= L.pending ||
      [...this.pending.values()].filter((p) => p.ip === ip).length >= L.pendingPerIp
    ) {
      throw new ConflictException('Too many pending device connections');
    }
    const timer = setTimeout(() => {
      this.disconnect(socket);
      socket.close();
    }, L.announcementMs);
    timer.unref?.();
    this.pending.set(socket, {
      socket,
      type,
      ip,
      start: now,
      timer,
      expires: 0,
      generation: 0,
      state: 'pending',
      seen: new Map(),
      announcements: 0,
      windowStart: now,
    });
  }

  isPending(socket: EnrollmentConnection): boolean {
    return this.pending.has(socket);
  }

  authenticated(socket: EnrollmentConnection): void {
    setDeviceFrameLimit(socket, true);
    this.disconnect(socket);
  }

  disconnect(socket: EnrollmentConnection): void {
    const pending = this.pending.get(socket);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.invalidate(pending);
    this.pending.delete(socket);
  }

  announce(
    socket: EnrollmentConnection,
    type: EnrollmentDeviceType,
    code: unknown,
    metadata: unknown,
    register: Pending['register'],
    notify: (message: string) => void,
  ): void {
    const pending = this.pending.get(socket);
    const now = performance.now();
    if (!pending || pending.type !== type || pending.state === 'consumed' || now - pending.start >= L.connectionMs) {
      throw new ConflictException('Enrollment connection expired; reconnect');
    }
    if (typeof code !== 'string' || !/^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(code)) {
      throw new BadRequestException('Upgrade the device to use enrollment codes');
    }
    if (Buffer.byteLength(JSON.stringify(metadata ?? {})) > L.metadataBytes)
      throw new BadRequestException('Enrollment metadata too large');
    if (now - pending.windowStart >= L.announcementWindowMs) {
      pending.windowStart = now;
      pending.announcements = 0;
    }
    if (++pending.announcements > L.announcements) throw new ConflictException('Too many enrollment announcements');
    const previousExpiry = pending.seen.get(code);
    if (previousExpiry !== undefined && (pending.code !== code || now >= previousExpiry)) {
      throw new ConflictException('Enrollment code expired; generate a fresh code');
    }
    if (pending.code === code) return; // Repetition cannot extend a code's expiry.
    this.invalidate(pending);
    let collision = this.codes.get(code);
    if (collision && collision.expires <= now) {
      this.invalidate(collision);
      collision = undefined;
    }
    if (collision) {
      this.invalidate(collision);
      collision.notify?.('CODE_COLLISION');
      notify('CODE_COLLISION');
      throw new ConflictException('Enrollment code collision; generate a fresh code');
    }
    pending.code = code;
    pending.expires = now + L.codeMs;
    pending.seen.set(code, pending.expires);
    pending.state = 'pending';
    pending.register = register;
    pending.notify = notify;
    this.codes.set(code, pending);
    clearTimeout(pending.timer);
    pending.timer = setTimeout(
      () => {
        this.disconnect(socket);
        socket.close();
      },
      L.connectionMs - (now - pending.start),
    );
    pending.timer.unref?.();
    notify('PENDING_APPROVAL');
  }

  async approve(
    type: EnrollmentDeviceType,
    code: string,
    account: { id: number; authenticationMethod?: 'session' | 'api-token'; apiTokenId?: number },
    ip: string,
  ): Promise<{ id: number }> {
    const now = performance.now();
    this.limiter.take('guess:global', L.guesses, now);
    this.limiter.take(`guess:account:${account.id}`, L.guessesPerAccount, now);
    this.limiter.take(`guess:ip:${ip}`, L.guessesPerIp, now);
    const pending = this.codes.get(code);
    if (!pending || pending.type !== type || pending.expires <= now || pending.socket.readyState !== 1) {
      throw new NotFoundException('Enrollment code expired or device disconnected');
    }
    if (pending.state !== 'pending') throw new ConflictException('Enrollment approval already in progress');
    const generation = pending.generation;
    const current = () =>
      this.pending.get(pending.socket) === pending &&
      pending.generation === generation &&
      pending.state === 'approving' &&
      pending.expires > performance.now() &&
      pending.socket.readyState === 1;
    pending.state = 'approving';
    let registration: EnrollmentRegistration | undefined;
    try {
      registration = await pending.register(current);
      if (!current()) throw new ConflictException('Enrollment changed during approval; try the current code');
      const audit = (action: string) =>
        recordAdministrationSafely(this.audit, {
          action,
          actorId: account.id,
          authenticationMethod: account.authenticationMethod,
          apiTokenId: account.apiTokenId,
          subjectType: 'device',
          subjectId: registration.id,
          details: { deviceType: type },
        });
      await audit('device.enrollment_approved');
      if (!current()) throw new ConflictException('Enrollment changed during approval');
      // Consume before delivery, even when delivery fails. Never replay issued credentials.
      pending.state = 'consumed';
      this.codes.delete(code);
      pending.code = undefined;
      const delivered = await registration.deliver();
      if (delivered === false) throw new ConflictException('Credential delivery failed; enroll again');
      await audit('device.enrolled');
      return { id: registration.id };
    } catch (error) {
      if (registration) await registration.discard();
      if (pending.generation === generation) {
        this.invalidate(pending);
        pending.notify?.('ENROLLMENT_FAILED');
      }
      throw error;
    }
  }

  private invalidate(pending: Pending): void {
    if (pending.code && this.codes.get(pending.code) === pending) this.codes.delete(pending.code);
    pending.code = undefined;
    pending.generation++;
    pending.state = 'pending';
    pending.register = undefined;
  }

  onModuleDestroy(): void {
    for (const socket of this.pending.keys()) this.disconnect(socket);
  }
}
