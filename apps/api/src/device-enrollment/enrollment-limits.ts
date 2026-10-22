import { HttpException, HttpStatus } from '@nestjs/common';

export const ENROLLMENT_LIMITS = {
  pending: 128,
  pendingPerIp: 8,
  announcementMs: 10_000,
  connectionMs: 300_000,
  codeMs: 30_000,
  metadataBytes: 1024,
  frameBytes: 4096,
  announcements: 3,
  announcementWindowMs: 30_000,
  connectionsPerIp: 10,
  connections: 100,
  guessesPerAccount: 5,
  guessesPerIp: 20,
  guesses: 100,
  windowMs: 60_000,
  counterEntries: 10_000,
} as const;

/** Never evict an active counter: doing so would reset an attacker's allowance. */
export class EnrollmentLimiter {
  private readonly counters = new Map<string, { count: number; until: number }>();
  take(key: string, limit: number, now: number, windowMs: number = ENROLLMENT_LIMITS.windowMs): void {
    for (const [entryKey, entry] of this.counters) if (entry.until <= now) this.counters.delete(entryKey);
    let entry = this.counters.get(key);
    if (!entry) {
      if (this.counters.size >= ENROLLMENT_LIMITS.counterEntries) this.reject();
      entry = { count: 0, until: now + windowMs };
      this.counters.set(key, entry);
    }
    if (++entry.count > limit) this.reject();
  }
  private reject(): never {
    throw new HttpException('Enrollment rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
  }
}
