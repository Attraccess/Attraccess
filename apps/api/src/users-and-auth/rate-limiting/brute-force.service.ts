import { User } from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FixedWindowCounterStore, WindowCounterEntry } from '../../common/rate-limiting/fixed-window-counter';
import { SettingsService } from '../../settings/settings.service';
import { recordFailure as recordFailureImplementation } from './brute-force-failure';
import { AccountLockedException, TooManyAuthAttemptsException } from './exceptions';
export type RateLimitScope =
  'login' | 'register' | 'password_reset_request' | 'password_reset_complete' | 'delete_account_confirm';

export interface CounterEntry extends WindowCounterEntry {
  lockoutUntil: number;
  lockoutCount: number;
}

export const MAX_COUNTER_ENTRIES = 10_000;

export // ponytail: coarse per-IP threshold = maxAttempts * 10; prevents username-spray bypass; tune multiplier if needed
const COARSE_IP_MULTIPLIER = 10;

export function isStale(entry: CounterEntry, now: number, windowMs: number): boolean {
  if (entry.lockoutUntil > now) return false;
  return now - entry.firstAt > windowMs;
}

export function ipKey(scope: RateLimitScope, ip: string, username: string | null = null): string {
  return `${scope}:${ip}:${username ?? ''}`;
}

export function ipCoarseKey(scope: RateLimitScope, ip: string): string {
  return `${scope}:${ip}`;
}

export function computeLockoutMs(
  policy: { lockoutDurationSeconds: number; exponentialBackoff: boolean; backoffMultiplier: number },
  priorLockouts: number,
): number {
  const baseMs = policy.lockoutDurationSeconds * 1000;
  if (!policy.exponentialBackoff || priorLockouts <= 0) {
    return baseMs;
  }
  return Math.floor(baseMs * Math.pow(policy.backoffMultiplier, priorLockouts));
}

// ponytail: coarse per-IP threshold = maxAttempts * 10; prevents username-spray bypass; tune multiplier if needed

@Injectable()
export class BruteForceProtectionService {
  private readonly ipCounters = new FixedWindowCounterStore<string, CounterEntry>(MAX_COUNTER_ENTRIES);
  private readonly ipCoarseCounters = new FixedWindowCounterStore<string, CounterEntry>(MAX_COUNTER_ENTRIES);
  private readonly accountCounters = new FixedWindowCounterStore<number, CounterEntry>(MAX_COUNTER_ENTRIES);
  private readonly nowFn: () => number = () => Date.now();

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly settingsService: SettingsService,
  ) {}

  async assertIpAllowed(scope: RateLimitScope, ip: string, username: string | null = null): Promise<void> {
    const coarseEntry = this.ipCoarseCounters.get(ipCoarseKey(scope, ip));
    if (coarseEntry) {
      const remaining = this.remainingLockoutSeconds(coarseEntry);
      if (remaining > 0) {
        throw new TooManyAuthAttemptsException(remaining);
      }
    }

    const entry = this.ipCounters.get(ipKey(scope, ip, username));
    if (!entry) return;
    const remaining = this.remainingLockoutSeconds(entry);
    if (remaining > 0) {
      throw new TooManyAuthAttemptsException(remaining);
    }
  }

  async assertAccountAllowed(user: User): Promise<void> {
    if (!user?.lockedUntil) {
      return;
    }
    const now = this.nowFn();
    const lockMs = new Date(user.lockedUntil).getTime();
    if (lockMs > now) {
      const retryAfter = Math.ceil((lockMs - now) / 1000);
      throw new AccountLockedException(retryAfter);
    }
  }

  async recordFailure(
    scope: RateLimitScope,
    ip: string,
    userId: number | null,
    username: string | null = null,
  ): Promise<void> {
    const getContextOwner = () => this;
    return recordFailureImplementation(
      {
        settingsService: getContextOwner().settingsService,
        nowFn: getContextOwner().nowFn,
        evictStale: getContextOwner().evictStale.bind(getContextOwner()),
        upsertCounter: getContextOwner().upsertCounter.bind(getContextOwner()),
        ipCounters: getContextOwner().ipCounters,
        ipCoarseCounters: getContextOwner().ipCoarseCounters,
        accountCounters: getContextOwner().accountCounters,
        userRepository: getContextOwner().userRepository,
      },
      scope,
      ip,
      userId,
      username,
    );
  }

  async recordSuccess(
    scope: RateLimitScope,
    ip: string,
    userId: number | null,
    username: string | null = null,
  ): Promise<void> {
    this.ipCounters.delete(ipKey(scope, ip, username));
    if (userId == null) {
      return;
    }
    this.accountCounters.delete(userId);
    await this.userRepository.update(
      { id: userId },
      {
        lockedUntil: null,
        failedLoginAttempts: 0,
        firstFailedLoginAt: null,
      },
    );
  }

  async unlockAccount(userId: number): Promise<void> {
    this.accountCounters.delete(userId);
    await this.userRepository.update(
      { id: userId },
      {
        lockedUntil: null,
        failedLoginAttempts: 0,
        firstFailedLoginAt: null,
      },
    );
  }

  private upsertCounter<K>(
    store: FixedWindowCounterStore<K, CounterEntry>,
    key: K,
    now: number,
    windowMs: number,
  ): CounterEntry {
    const existing = store.get(key);
    if (!existing) {
      const entry: CounterEntry = { count: 1, firstAt: now, lockoutUntil: 0, lockoutCount: 0 };
      store.set(key, entry);
      return entry;
    }
    if (existing.lockoutUntil > now) {
      existing.count += 1;
      return existing;
    }
    if (now - existing.firstAt > windowMs) {
      existing.count = 1;
      existing.firstAt = now;
      existing.lockoutUntil = 0;
      return existing;
    }
    existing.count += 1;
    return existing;
  }

  private remainingLockoutSeconds(entry: CounterEntry): number {
    const now = this.nowFn();
    if (entry.lockoutUntil <= now) {
      return 0;
    }
    return Math.ceil((entry.lockoutUntil - now) / 1000);
  }

  private evictStale(now: number, windowMs: number): void {
    this.ipCounters.evict((entry) => isStale(entry, now, windowMs));
    this.ipCoarseCounters.evict((entry) => isStale(entry, now, windowMs));
    this.accountCounters.evict((entry) => isStale(entry, now, windowMs));
  }
}
