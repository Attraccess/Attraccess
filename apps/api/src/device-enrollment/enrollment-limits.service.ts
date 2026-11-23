import { Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { ClusterService } from '../cluster/cluster.service';
import { valkeyCall } from '../cluster/valkey-call';
import { FixedWindowCounterStore, WindowCounterEntry } from '../common/rate-limiting/fixed-window-counter';
import { addressBucket } from './client-address';
import {
  ENROLLMENT_ADDRESS_ATTEMPTS,
  ENROLLMENT_APPROVER_WRONG_CODES,
  ENROLLMENT_CONNECTION_ATTEMPTS,
  ENROLLMENT_MAX_PENDING_PER_ADDRESS,
  ENROLLMENT_MAX_PENDING_TOTAL,
} from './device-enrollment.constants';
import { EnrollmentRateLimitedException } from './enrollment-rate-limited.exception';

const MAX_COUNTER_ENTRIES = 10_000;

const approverKey = (userId: number) => `attraccess:enrollment:approver-wrong-codes:${userId}`;
/** Count and window in one step: the first wrong code starts the window, later ones never extend it. */
const RECORD_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 or redis.call('PTTL', KEYS[1]) < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return count`;
const READ_SCRIPT = `
local count = redis.call('GET', KEYS[1])
if not count then return {0, 0} end
return {tonumber(count), redis.call('PTTL', KEYS[1])}`;

export interface Admission {
  allowed: boolean;
  reason?: 'RATE_LIMITED';
  retryAfterMs?: number;
}

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
 * Limits shared by every device type that enrolls through an admin approval: attempts per connection and
 * per client address, how many requests may wait at once, and how many wrong codes one approver may try.
 * Waiting requests live in memory only; a device that is never approved leaves nothing in the database.
 *
 * With Valkey (several API instances, ATT-1163) the wrong-code count is shared, so an approver cannot multiply the
 * limit by spreading guesses over instances. Admission and the pending caps stay per instance: they guard the
 * memory and sockets of the instance that holds the device.
 */
@Injectable()
export class EnrollmentLimitsService {
  private readonly connectionAttempts = new FixedWindowCounterStore<string, WindowCounterEntry>(MAX_COUNTER_ENTRIES);
  private readonly addressAttempts = new FixedWindowCounterStore<string, WindowCounterEntry>(MAX_COUNTER_ENTRIES);
  private readonly approverFailures = new FixedWindowCounterStore<number, WindowCounterEntry>(MAX_COUNTER_ENTRIES);
  /** request id -> address bucket, for every request that is waiting right now. */
  private readonly pending = new Map<string, string>();
  private readonly shared: Redis | null;

  constructor(@Optional() cluster?: ClusterService) {
    this.shared = cluster?.enabled ? cluster.valkey : null;
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  /** Counts one attempt (a device announcing itself) and refuses it when a limit is exceeded. */
  admit(connectionId: string, address: string, now = Date.now()): Admission {
    const bucket = addressBucket(address);
    const refused = [
      countAttempt(this.connectionAttempts, connectionId, ENROLLMENT_CONNECTION_ATTEMPTS, now),
      countAttempt(this.addressAttempts, bucket, ENROLLMENT_ADDRESS_ATTEMPTS, now),
    ].filter((result) => !result.allowed);
    if (refused.length > 0) {
      return { allowed: false, reason: 'RATE_LIMITED', retryAfterMs: Math.max(...refused.map((r) => r.retryAfterMs)) };
    }
    return { allowed: true };
  }

  /** Reserves a waiting slot for the request, or reports that the server or the address is full. */
  reservePending(requestId: string, address: string): boolean {
    const bucket = addressBucket(address);
    const fromAddress = [...this.pending.values()].filter((other) => other === bucket).length;
    if (fromAddress >= ENROLLMENT_MAX_PENDING_PER_ADDRESS || this.pending.size >= ENROLLMENT_MAX_PENDING_TOTAL) {
      return false;
    }
    this.pending.set(requestId, bucket);
    return true;
  }

  releasePending(requestId: string): void {
    this.pending.delete(requestId);
  }

  forgetConnection(connectionId: string): void {
    this.connectionAttempts.delete(connectionId);
  }

  /**
   * Throws the 429 exception while the approver is over the wrong-code limit. With Valkey, Valkey's clock decides
   * the window and an unreachable Valkey rejects with its own error (callers answer 503).
   */
  async assertApproverAllowed(userId: number, now = Date.now()): Promise<void> {
    const { limit, windowMs } = ENROLLMENT_APPROVER_WRONG_CODES;
    let remainingMs: number;
    if (this.shared) {
      const valkey = this.shared;
      const [count, ttlMs] = (await valkeyCall(valkey, () => valkey.eval(READ_SCRIPT, 1, approverKey(userId)))) as [
        number,
        number,
      ];
      if (count < limit) return;
      remainingMs = ttlMs > 0 ? ttlMs : windowMs;
    } else {
      this.approverFailures.evict(isStale(windowMs, now));
      const failures = this.approverFailures.get(userId);
      if (!failures || failures.count < limit) return;
      remainingMs = failures.firstAt + windowMs - now;
    }
    throw new EnrollmentRateLimitedException(Math.max(1, Math.ceil(remainingMs / 1000)));
  }

  async recordWrongCode(userId: number, now = Date.now()): Promise<void> {
    if (this.shared) {
      const valkey = this.shared;
      await valkeyCall(valkey, () =>
        valkey.eval(RECORD_SCRIPT, 1, approverKey(userId), ENROLLMENT_APPROVER_WRONG_CODES.windowMs),
      );
      return;
    }
    const failures = this.approverFailures.get(userId);
    if (failures) failures.count += 1;
    else this.approverFailures.set(userId, { count: 1, firstAt: now });
  }
}
