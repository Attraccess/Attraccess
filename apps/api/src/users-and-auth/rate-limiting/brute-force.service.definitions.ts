import { WindowCounterEntry } from '../../common/rate-limiting/fixed-window-counter';

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
