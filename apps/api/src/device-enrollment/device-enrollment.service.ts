import { randomUUID } from 'crypto';
import { BadGatewayException, Injectable, Logger, NotFoundException, OnApplicationShutdown } from '@nestjs/common';
import { FixedWindowCounterStore, WindowCounterEntry } from '../common/rate-limiting/fixed-window-counter';
import { AuditService } from '../audit/audit.service';
import { TooManyAuthAttemptsException } from '../users-and-auth/rate-limiting/exceptions';
import {
  ENROLLMENT_ADDRESS_ATTEMPTS,
  ENROLLMENT_APPROVER_WRONG_CODES,
  ENROLLMENT_CODE_ROTATION_MS,
  ENROLLMENT_CONNECTION_ATTEMPTS,
  ENROLLMENT_MAX_PENDING_PER_ADDRESS,
  ENROLLMENT_MAX_PENDING_TOTAL,
  ENROLLMENT_PATTERN_COOLDOWN_MS,
  ENROLLMENT_REQUEST_TTL_MS,
} from './device-enrollment.constants';
import { LedPattern, canonicalLedPattern, isValidLedPattern, pickLedPattern, sameLedPattern } from './led-pattern';
import { formatEnrollmentCode, generateEnrollmentCode, normalizeEnrollmentCode } from './enrollment-code';

export interface ProvisionedDevice {
  kind: 'reader';
  id: number;
  name: string;
  /** Hands the credentials to the waiting connection; resolves false when the device never confirmed. */
  deliver: () => Promise<boolean>;
  /** Removes everything provisioned, used when delivery failed. */
  rollback: () => Promise<void>;
}

export interface EnrollmentConnection {
  id: string;
  address: string;
  /** Readers without a screen (Attractap Lite) are approved by a colour pattern on their LED ring. */
  hasScreen?: boolean;
  firmware?: { name?: string; variant?: string; version?: string };
  /**
   * Shows a (rotated) code on the waiting device. Relative times only, devices have no synced clock.
   * `pattern` is only passed for readers without a screen; null means no pattern was free.
   */
  sendCode: (code: string, rotatesInMs: number, expiresInMs: number, pattern?: LedPattern | null) => void;
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

export interface LitePendingReader {
  pendingId: string;
  pattern: LedPattern;
  rotatesInSeconds: number;
  firmware: { name?: string; variant?: string; version?: string } | null;
  waitingSince: string;
  clientAddress: string;
}

export interface EnrollmentResult {
  kind: 'reader';
  id: number;
  name: string;
}

interface Pending {
  connection: EnrollmentConnection;
  /** Random handle for the admin UI, unrelated to the code. Only used for readers without a screen. */
  pendingId: string;
  since: number;
  pattern: LedPattern | null;
  previousPattern: LedPattern | null;
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
  /** pendingId -> connection id, only readers without a screen */
  private readonly litePending = new Map<string, string>();
  /** canonical patterns (current and previous) of every waiting Lite reader */
  private readonly patterns = new Set<string>();
  /** canonical pattern -> time until which it stays reserved after its reader left */
  private readonly patternCooldown = new Map<string, number>();
  private readonly connectionAttempts = new FixedWindowCounterStore<string, WindowCounterEntry>(MAX_COUNTER_ENTRIES);
  private readonly addressAttempts = new FixedWindowCounterStore<string, WindowCounterEntry>(MAX_COUNTER_ENTRIES);
  private readonly approverFailures = new FixedWindowCounterStore<number, WindowCounterEntry>(MAX_COUNTER_ENTRIES);

  constructor(private readonly audit: AuditService) {}

  get pendingCount(): number {
    return this.pending.size;
  }

  onApplicationShutdown(): void {
    for (const connectionId of [...this.pending.keys()]) this.release(connectionId);
  }

  /** Starts (or re-announces) the pending request of a connection. Returns false when a limit refused it. */
  request(connection: EnrollmentConnection): boolean {
    const now = Date.now();

    const attempt = (
      store: FixedWindowCounterStore<string, WindowCounterEntry>,
      key: string,
      policy: { limit: number; windowMs: number },
    ) => {
      store.evict(isStale(policy.windowMs, now));
      const entry = store.get(key);
      if (!entry) {
        store.set(key, { count: 1, firstAt: now });
        return { allowed: true, retryAfterMs: 0 };
      }
      entry.count += 1;
      return { allowed: entry.count <= policy.limit, retryAfterMs: entry.firstAt + policy.windowMs - now };
    };

    const perConnection = attempt(this.connectionAttempts, connection.id, ENROLLMENT_CONNECTION_ATTEMPTS);
    const perAddress = attempt(this.addressAttempts, connection.address, ENROLLMENT_ADDRESS_ATTEMPTS);
    if (!perConnection.allowed || !perAddress.allowed) {
      connection.sendRejected('RATE_LIMITED', Math.max(perConnection.retryAfterMs, perAddress.retryAfterMs, 0));
      return false;
    }

    const existing = this.pending.get(connection.id);
    if (existing) {
      this.announce(existing, now);
      return true;
    }

    const fromAddress = [...this.pending.values()].filter(
      (other) => other.connection.address === connection.address,
    ).length;
    if (fromAddress >= ENROLLMENT_MAX_PENDING_PER_ADDRESS || this.pending.size >= ENROLLMENT_MAX_PENDING_TOTAL) {
      connection.sendRejected('BUSY', ENROLLMENT_CODE_ROTATION_MS);
      return false;
    }

    const entry: Pending = {
      connection,
      pendingId: randomUUID(),
      since: now,
      pattern: null,
      previousPattern: null,
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
    if (this.isLite(entry)) {
      this.litePending.set(entry.pendingId, connection.id);
      entry.pattern = this.assignPattern();
    }
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
    this.releasePatterns(entry);
    this.litePending.delete(entry.pendingId);
    this.pending.delete(connectionId);
    this.connectionAttempts.delete(connectionId);
  }

  async approve(
    rawCode: string,
    principal: EnrollmentPrincipal,
    options: { name?: string } = {},
  ): Promise<EnrollmentResult> {
    const failures = this.checkApproverLimit(principal);
    const code = normalizeEnrollmentCode(rawCode);
    const connectionId = code ? this.codes.get(code) : undefined;
    const entry = connectionId ? this.pending.get(connectionId) : undefined;
    if (!entry) {
      this.recordApproverFailure(principal, failures);
      throw new NotFoundException('EnrollmentCodeNotFound');
    }
    return this.complete(entry, principal, options, { source: 'reader-enrollment' });
  }

  /** Waiting readers without a screen that currently show a pattern, oldest first. */
  listLitePending(): LitePendingReader[] {
    const now = Date.now();
    return [...this.pending.values()]
      .filter((entry) => this.isLite(entry) && entry.pattern)
      .sort((a, b) => a.since - b.since)
      .map((entry) => ({
        pendingId: entry.pendingId,
        pattern: [...(entry.pattern as LedPattern)],
        rotatesInSeconds: Math.max(0, Math.ceil((entry.nextRotationAt - now) / 1000)),
        firmware: entry.connection.firmware ?? null,
        waitingSince: new Date(entry.since).toISOString(),
        clientAddress: entry.connection.address,
      }));
  }

  /**
   * Approves a reader without a screen by the pattern the admin saw on its ring. Unknown IDs, readers
   * with a screen and wrong patterns are indistinguishable for the caller.
   */
  async approveLite(
    pendingId: string,
    pattern: readonly string[],
    principal: EnrollmentPrincipal,
    options: { name?: string } = {},
  ): Promise<EnrollmentResult> {
    const failures = this.checkApproverLimit(principal);
    const connectionId = this.litePending.get(pendingId);
    const entry = connectionId ? this.pending.get(connectionId) : undefined;
    const matches =
      !!entry &&
      isValidLedPattern(pattern) &&
      ((!!entry.pattern && sameLedPattern(entry.pattern, pattern)) ||
        (!!entry.previousPattern && sameLedPattern(entry.previousPattern, pattern)));
    if (!entry || !matches) {
      this.recordApproverFailure(principal, failures);
      throw new NotFoundException('EnrollmentCodeNotFound');
    }
    return this.complete(entry, principal, options, { source: 'reader-enrollment', method: 'led-pattern' });
  }

  private checkApproverLimit(principal: EnrollmentPrincipal): WindowCounterEntry | undefined {
    const now = Date.now();
    this.approverFailures.evict(isStale(ENROLLMENT_APPROVER_WRONG_CODES.windowMs, now));
    const failures = this.approverFailures.get(principal.userId);
    if (failures && failures.count >= ENROLLMENT_APPROVER_WRONG_CODES.limit) {
      throw new TooManyAuthAttemptsException(
        Math.max(1, Math.ceil((failures.firstAt + ENROLLMENT_APPROVER_WRONG_CODES.windowMs - now) / 1000)),
      );
    }
    return failures;
  }

  private recordApproverFailure(principal: EnrollmentPrincipal, failures: WindowCounterEntry | undefined): void {
    if (failures) failures.count += 1;
    else this.approverFailures.set(principal.userId, { count: 1, firstAt: Date.now() });
  }

  private async complete(
    entry: Pending,
    principal: EnrollmentPrincipal,
    options: { name?: string },
    auditDetails: { source: 'reader-enrollment'; method?: 'led-pattern' },
  ): Promise<EnrollmentResult> {
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

    await this.audit
      .recordAttractap({
        action: 'reader.enrolled',
        actorId: principal.userId,
        authenticationMethod: principal.authenticationMethod,
        ...(principal.authenticationMethod === 'api-token' ? { apiTokenId: principal.apiTokenId } : {}),
        subjectId: device.id,
        details: auditDetails,
      })
      .catch(() => undefined);

    this.approverFailures.delete(principal.userId);
    return { kind: device.kind, id: device.id, name: device.name };
  }

  private isLite(entry: Pending): boolean {
    return entry.connection.hasScreen === false;
  }

  /**
   * Picks a pattern no waiting Lite reader shows or showed in the last rotation, and none whose reader
   * left so recently that its ring may still show it.
   */
  private assignPattern(): LedPattern | null {
    const now = Date.now();
    for (const [key, until] of this.patternCooldown) if (until <= now) this.patternCooldown.delete(key);
    const pattern = pickLedPattern({ has: (key) => this.patterns.has(key) || this.patternCooldown.has(key) });
    if (pattern) this.patterns.add(canonicalLedPattern(pattern));
    return pattern;
  }

  private releasePatterns(entry: Pending): void {
    const until = Date.now() + ENROLLMENT_PATTERN_COOLDOWN_MS;
    for (const pattern of [entry.pattern, entry.previousPattern]) {
      if (!pattern) continue;
      const key = canonicalLedPattern(pattern);
      this.patterns.delete(key);
      this.patternCooldown.set(key, until);
    }
  }

  private announce(entry: Pending, now: number): void {
    entry.connection.sendCode(
      formatEnrollmentCode(entry.code),
      Math.max(0, entry.nextRotationAt - now),
      Math.max(0, entry.expiresAt - now),
      ...(this.isLite(entry) ? [entry.pattern] : []),
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
    if (this.isLite(entry)) this.rotatePattern(entry);
    entry.nextRotationAt = now + ENROLLMENT_CODE_ROTATION_MS;
    entry.rotationTimer = setTimeout(() => this.rotate(connectionId), ENROLLMENT_CODE_ROTATION_MS);
    entry.rotationTimer.unref?.();
    this.announce(entry, now);
  }

  /**
   * The previous pattern stays valid (and reserved) until the next rotation. The outgoing one is freed
   * only after the pick, so a reader never gets back the pattern it showed two rotations ago.
   */
  private rotatePattern(entry: Pending): void {
    const outgoing = entry.previousPattern;
    entry.previousPattern = entry.pattern;
    entry.pattern = this.assignPattern();
    if (outgoing) this.patterns.delete(canonicalLedPattern(outgoing));
  }

  private expire(connectionId: string): void {
    const entry = this.pending.get(connectionId);
    if (!entry) return;
    this.release(connectionId);
    entry.connection.close();
  }
}
