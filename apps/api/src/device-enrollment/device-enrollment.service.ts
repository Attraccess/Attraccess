import { BadGatewayException, Injectable, Logger, NotFoundException, OnApplicationShutdown } from '@nestjs/common';
import { FixedWindowCounterStore, WindowCounterEntry } from '../common/rate-limiting/fixed-window-counter';
import { addressBucket } from './client-address';
import {
  DeviceKind,
  ENROLLMENT_ADDRESS_ATTEMPTS,
  ENROLLMENT_APPROVER_WRONG_CODES,
  ENROLLMENT_CODE_ROTATION_MS,
  ENROLLMENT_CONNECTION_ATTEMPTS,
  ENROLLMENT_MAX_PENDING_PER_ADDRESS,
  ENROLLMENT_MAX_PENDING_TOTAL,
  ENROLLMENT_REQUEST_TTL_MS,
} from './device-enrollment.constants';
import { EnrollmentRateLimitedException } from './enrollment-rate-limited.exception';
import { formatEnrollmentCode, generateEnrollmentCode, normalizeEnrollmentCode } from './enrollment-code';

export interface ProvisionedDevice {
  kind: DeviceKind;
  id: number;
  name: string;
  /** Hands the credentials to the waiting connection; resolves false when the device never confirmed. */
  deliver: () => Promise<boolean>;
  /** Removes everything provisioned, used when delivery failed. */
  rollback: () => Promise<void>;
  /** Audits the approval in the device's own domain. Failures are logged, they do not undo the enrollment. */
  recordEnrolled: (principal: EnrollmentPrincipal) => Promise<void>;
}

export interface EnrollmentConnection {
  id: string;
  address: string;
  /** Shows a (rotated) code on the waiting device. Relative times only, devices have no synced clock. */
  sendCode: (code: string, rotatesInMs: number, expiresInMs: number) => void;
  /** Tells the device its request was not accepted, e.g. because of a limit. */
  sendRejected: (reason: EnrollmentRejection, retryAfterMs: number) => void;
  /** Creates the record and credentials. Only called once an approver confirmed the code. */
  provision: (options: { name?: string }) => Promise<ProvisionedDevice>;
  close: () => void;
}

export type EnrollmentRejection = 'RATE_LIMITED' | 'BUSY';

export interface EnrollmentPrincipal {
  userId: number;
  authenticationMethod: 'session' | 'api-token';
  apiTokenId?: number;
}

export interface EnrollmentResult {
  kind: DeviceKind;
  id: number;
  name: string;
}

interface Pending {
  connection: EnrollmentConnection;
  /** Key for the per-address limits, see addressBucket. */
  addressBucket: string;
  code: string;
  previousCode: string | null;
  nextRotationAt: number;
  expiresAt: number;
  rotationTimer: NodeJS.Timeout;
  expiryTimer: NodeJS.Timeout;
}

const MAX_COUNTER_ENTRIES = 10_000;

function isStale(windowMs: number, now: number) {
  return (entry: WindowCounterEntry) => now - entry.firstAt > windowMs;
}

function countAttempt<K>(
  store: FixedWindowCounterStore<K, WindowCounterEntry>,
  key: K,
  policy: { limit: number; windowMs: number },
  now: number,
): { allowed: boolean; retryAfterMs: number } {
  store.evict(isStale(policy.windowMs, now));
  const entry = store.get(key);
  if (!entry) {
    store.set(key, { count: 1, firstAt: now });
    return { allowed: true, retryAfterMs: 0 };
  }
  entry.count += 1;
  return { allowed: entry.count <= policy.limit, retryAfterMs: Math.max(0, entry.firstAt + policy.windowMs - now) };
}

/**
 * Pending enrollment requests of devices that connected without credentials. They live in memory only:
 * a device that is not approved leaves no trace in the database.
 */
@Injectable()
export class DeviceEnrollmentService implements OnApplicationShutdown {
  private readonly logger = new Logger(DeviceEnrollmentService.name);
  private readonly pending = new Map<string, Pending>();
  /** code (current and previous) -> connection id */
  private readonly codes = new Map<string, string>();
  private readonly connectionAttempts = new FixedWindowCounterStore<string, WindowCounterEntry>(MAX_COUNTER_ENTRIES);
  private readonly addressAttempts = new FixedWindowCounterStore<string, WindowCounterEntry>(MAX_COUNTER_ENTRIES);
  private readonly approverFailures = new FixedWindowCounterStore<number, WindowCounterEntry>(MAX_COUNTER_ENTRIES);

  get pendingCount(): number {
    return this.pending.size;
  }

  onApplicationShutdown(): void {
    for (const connectionId of [...this.pending.keys()]) this.release(connectionId);
  }

  /** Starts (or re-announces) the pending request of a connection. Returns false when a limit refused it. */
  request(connection: EnrollmentConnection): boolean {
    const now = Date.now();

    // A repeated REGISTER keeps the request (and its code) alive. Over the limit it is ignored rather than
    // rejected, because a rejection makes the device drop a code that can still be approved.
    const existing = this.pending.get(connection.id);
    if (existing) {
      if (countAttempt(this.connectionAttempts, connection.id, ENROLLMENT_CONNECTION_ATTEMPTS, now).allowed) {
        this.announce(existing, now);
      }
      return true;
    }

    const bucket = addressBucket(connection.address);
    const refused = [
      countAttempt(this.connectionAttempts, connection.id, ENROLLMENT_CONNECTION_ATTEMPTS, now),
      countAttempt(this.addressAttempts, bucket, ENROLLMENT_ADDRESS_ATTEMPTS, now),
    ].filter((result) => !result.allowed);
    if (refused.length > 0) {
      connection.sendRejected('RATE_LIMITED', Math.max(...refused.map((result) => result.retryAfterMs)));
      return false;
    }

    const fromAddress = [...this.pending.values()].filter((other) => other.addressBucket === bucket).length;
    if (fromAddress >= ENROLLMENT_MAX_PENDING_PER_ADDRESS || this.pending.size >= ENROLLMENT_MAX_PENDING_TOTAL) {
      connection.sendRejected('BUSY', ENROLLMENT_CODE_ROTATION_MS);
      return false;
    }

    const entry: Pending = {
      connection,
      addressBucket: bucket,
      code: generateEnrollmentCode((code) => this.codes.has(code)),
      previousCode: null,
      nextRotationAt: now + ENROLLMENT_CODE_ROTATION_MS,
      expiresAt: now + ENROLLMENT_REQUEST_TTL_MS,
      rotationTimer: setTimeout(() => this.rotate(connection.id), ENROLLMENT_CODE_ROTATION_MS),
      expiryTimer: setTimeout(() => this.expire(connection.id), ENROLLMENT_REQUEST_TTL_MS),
    };
    entry.rotationTimer.unref?.();
    entry.expiryTimer.unref?.();
    this.pending.set(connection.id, entry);
    this.codes.set(entry.code, connection.id);
    this.announce(entry, now);
    return true;
  }

  /** Drops the pending request of a connection (closed, approved or expired). */
  release(connectionId: string): void {
    const entry = this.pending.get(connectionId);
    if (!entry) return;
    clearTimeout(entry.rotationTimer);
    clearTimeout(entry.expiryTimer);
    this.codes.delete(entry.code);
    if (entry.previousCode) this.codes.delete(entry.previousCode);
    this.pending.delete(connectionId);
    this.connectionAttempts.delete(connectionId);
  }

  async approve(
    rawCode: string,
    principal: EnrollmentPrincipal,
    options: { name?: string } = {},
  ): Promise<EnrollmentResult> {
    const now = Date.now();
    this.approverFailures.evict(isStale(ENROLLMENT_APPROVER_WRONG_CODES.windowMs, now));
    const failures = this.approverFailures.get(principal.userId);
    if (failures && failures.count >= ENROLLMENT_APPROVER_WRONG_CODES.limit) {
      throw new EnrollmentRateLimitedException(
        Math.max(1, Math.ceil((failures.firstAt + ENROLLMENT_APPROVER_WRONG_CODES.windowMs - now) / 1000)),
      );
    }

    const code = normalizeEnrollmentCode(rawCode);
    const connectionId = code ? this.codes.get(code) : undefined;
    const entry = connectionId ? this.pending.get(connectionId) : undefined;
    if (!entry) {
      if (failures) failures.count += 1;
      else this.approverFailures.set(principal.userId, { count: 1, firstAt: now });
      throw new NotFoundException('EnrollmentCodeNotFound');
    }

    // Single use: nobody else can approve the same request while it is being provisioned.
    const { connection } = entry;
    this.release(connection.id);

    let device: ProvisionedDevice;
    try {
      device = await connection.provision(options);
    } catch (error) {
      this.logger.error(`Provisioning failed for connection ${connection.id}: ${(error as Error).message}`);
      connection.close();
      throw new BadGatewayException('EnrollmentProvisioningFailed');
    }

    let delivered = false;
    try {
      delivered = await device.deliver();
    } catch (error) {
      this.logger.error(`Delivering credentials failed: ${(error as Error).message}`);
    }
    if (!delivered) {
      await device.rollback().catch((error) => this.logger.error(`Rollback failed: ${(error as Error).message}`));
      connection.close();
      throw new BadGatewayException('EnrollmentDeliveryFailed');
    }

    try {
      await device.recordEnrolled(principal);
    } catch (error) {
      this.logger.error(`Auditing the enrollment of ${device.kind} ${device.id} failed: ${(error as Error).message}`);
    }

    this.approverFailures.delete(principal.userId);
    return { kind: device.kind, id: device.id, name: device.name };
  }

  private announce(entry: Pending, now: number): void {
    entry.connection.sendCode(
      formatEnrollmentCode(entry.code),
      Math.max(0, entry.nextRotationAt - now),
      Math.max(0, entry.expiresAt - now),
    );
  }

  private rotate(connectionId: string): void {
    const entry = this.pending.get(connectionId);
    if (!entry) return;
    const now = Date.now();
    // The code before the previous one stops working now; the previous one only until the next rotation.
    if (entry.previousCode) this.codes.delete(entry.previousCode);
    entry.previousCode = entry.code;
    entry.code = generateEnrollmentCode((code) => this.codes.has(code));
    this.codes.set(entry.code, connectionId);
    entry.nextRotationAt = now + ENROLLMENT_CODE_ROTATION_MS;
    entry.rotationTimer = setTimeout(() => this.rotate(connectionId), ENROLLMENT_CODE_ROTATION_MS);
    entry.rotationTimer.unref?.();
    this.announce(entry, now);
  }

  private expire(connectionId: string): void {
    const entry = this.pending.get(connectionId);
    if (!entry) return;
    this.release(connectionId);
    entry.connection.close();
  }
}
