import type { BruteForceProtectionService } from './brute-force.service';
import { COARSE_IP_MULTIPLIER, computeLockoutMs, ipCoarseKey, ipKey, RateLimitScope } from './brute-force.service';

interface BruteForceProtectionServiceBruteForceFailureContext {
  settingsService: BruteForceProtectionService['settingsService'];
  nowFn: BruteForceProtectionService['nowFn'];
  evictStale: BruteForceProtectionService['evictStale'];
  upsertCounter: BruteForceProtectionService['upsertCounter'];
  ipCounters: BruteForceProtectionService['ipCounters'];
  ipCoarseCounters: BruteForceProtectionService['ipCoarseCounters'];
  accountCounters: BruteForceProtectionService['accountCounters'];
  userRepository: BruteForceProtectionService['userRepository'];
}
export async function recordFailure(
  context: BruteForceProtectionServiceBruteForceFailureContext,
  scope: RateLimitScope,
  ip: string,
  userId: number | null,
  username: string | null = null,
): Promise<void> {
  const policy = await context.settingsService.getRateLimitPolicy();
  const windowMs = policy.windowSeconds * 1000;
  const now = context.nowFn();

  context.evictStale(now, windowMs);

  const ipEntry = context.upsertCounter(context.ipCounters, ipKey(scope, ip, username), now, windowMs);
  if (ipEntry.count >= policy.maxAttempts) {
    const durationMs = computeLockoutMs(policy, ipEntry.lockoutCount);
    ipEntry.lockoutUntil = now + durationMs;
    ipEntry.lockoutCount += 1;
    ipEntry.count = 0;
    ipEntry.firstAt = now;
  }

  const coarseEntry = context.upsertCounter(context.ipCoarseCounters, ipCoarseKey(scope, ip), now, windowMs);
  if (coarseEntry.count >= policy.maxAttempts * COARSE_IP_MULTIPLIER) {
    const durationMs = computeLockoutMs(policy, coarseEntry.lockoutCount);
    coarseEntry.lockoutUntil = now + durationMs;
    coarseEntry.lockoutCount += 1;
    coarseEntry.count = 0;
    coarseEntry.firstAt = now;
  }

  if (userId == null) {
    return;
  }

  const accountEntry = context.upsertCounter(context.accountCounters, userId, now, windowMs);
  if (accountEntry.count >= policy.maxAttempts) {
    const durationMs = computeLockoutMs(policy, accountEntry.lockoutCount);
    const lockedUntil = new Date(now + durationMs);
    accountEntry.lockoutUntil = now + durationMs;
    accountEntry.lockoutCount += 1;
    accountEntry.count = 0;
    accountEntry.firstAt = now;
    await context.userRepository.update(
      { id: userId },
      {
        lockedUntil,
        failedLoginAttempts: 0,
        firstFailedLoginAt: null,
      },
    );
    return;
  }

  await context.userRepository.update(
    { id: userId },
    {
      failedLoginAttempts: accountEntry.count,
      firstFailedLoginAt: new Date(accountEntry.firstAt),
    },
  );
}
