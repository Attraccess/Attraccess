import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '@attraccess/database-entities';
import { SettingsService } from '../../settings/settings.service';
import { FixedWindowCounterStore, WindowCounterEntry } from '../../common/rate-limiting/fixed-window-counter';
import { AccountLockedException, TooManyAuthAttemptsException } from './exceptions';

export type RateLimitScope =
  | 'login'
  | 'register'
  | 'password_reset_request'
  | 'password_reset_complete';

interface CounterEntry extends WindowCounterEntry {
  lockoutUntil: number;
  lockoutCount: number;
}

const MAX_COUNTER_ENTRIES = 10_000;

@Injectable()
export class BruteForceProtectionService {
  private readonly ipCounters = new FixedWindowCounterStore<string, CounterEntry>(MAX_COUNTER_ENTRIES);
  private readonly accountCounters = new FixedWindowCounterStore<number, CounterEntry>(MAX_COUNTER_ENTRIES);
  private readonly nowFn: () => number = () => Date.now();

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly settingsService: SettingsService,
  ) {}

  async assertIpAllowed(scope: RateLimitScope, ip: string): Promise<void> {
    const key = ipKey(scope, ip);
    const entry = this.ipCounters.get(key);
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

  async recordFailure(scope: RateLimitScope, ip: string, userId: number | null): Promise<void> {
    const policy = await this.settingsService.getRateLimitPolicy();
    const windowMs = policy.windowSeconds * 1000;
    const now = this.nowFn();

    this.evictStale(now, windowMs);

    const ipEntry = this.upsertCounter(this.ipCounters, ipKey(scope, ip), now, windowMs);
    if (ipEntry.count >= policy.maxAttempts) {
      const durationMs = computeLockoutMs(policy, ipEntry.lockoutCount);
      ipEntry.lockoutUntil = now + durationMs;
      ipEntry.lockoutCount += 1;
      ipEntry.count = 0;
      ipEntry.firstAt = now;
    }

    if (userId == null) {
      return;
    }

    const accountEntry = this.upsertCounter(this.accountCounters, userId, now, windowMs);
    if (accountEntry.count >= policy.maxAttempts) {
      const durationMs = computeLockoutMs(policy, accountEntry.lockoutCount);
      const lockedUntil = new Date(now + durationMs);
      accountEntry.lockoutUntil = now + durationMs;
      accountEntry.lockoutCount += 1;
      accountEntry.count = 0;
      accountEntry.firstAt = now;
      await this.userRepository.update(
        { id: userId },
        {
          lockedUntil,
          failedLoginAttempts: 0,
          firstFailedLoginAt: null,
        },
      );
      return;
    }

    await this.userRepository.update(
      { id: userId },
      {
        failedLoginAttempts: accountEntry.count,
        firstFailedLoginAt: new Date(accountEntry.firstAt),
      },
    );
  }

  async recordSuccess(scope: RateLimitScope, ip: string, userId: number | null): Promise<void> {
    this.ipCounters.delete(ipKey(scope, ip));
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
    this.accountCounters.evict((entry) => isStale(entry, now, windowMs));
  }
}

function isStale(entry: CounterEntry, now: number, windowMs: number): boolean {
  if (entry.lockoutUntil > now) return false;
  return now - entry.firstAt > windowMs;
}

function ipKey(scope: RateLimitScope, ip: string): string {
  return `${scope}:${ip}`;
}

function computeLockoutMs(
  policy: { lockoutDurationSeconds: number; exponentialBackoff: boolean; backoffMultiplier: number },
  priorLockouts: number,
): number {
  const baseMs = policy.lockoutDurationSeconds * 1000;
  if (!policy.exponentialBackoff || priorLockouts <= 0) {
    return baseMs;
  }
  return Math.floor(baseMs * Math.pow(policy.backoffMultiplier, priorLockouts));
}
