import { Injectable } from '@nestjs/common';

export const DECISION_TTL_MS = 15 * 60_000;
/** After a reader answered in place, a late SESSION_ENDED event must not resurrect the question. */
const SUPPRESS_MS = 10_000;
const MAX_ENTRIES = 1000;

interface Entry {
  reservationId: number;
  expiresAt: number;
}

/**
 * Short-lived, in-memory "keep or free the rest?" questions for web/API users: recorded when the holder
 * stopped a session inside their own running booking, read by the plugin's resource page, cleared by
 * keep / end-early / expiry / the holder's next session start. Per process (single instance, ATT-1146);
 * losing it on restart only drops a convenience dialog, the booking itself is untouched.
 */
@Injectable()
export class PendingDecisionStore {
  private readonly entries = new Map<string, Entry>();
  private readonly suppressed = new Map<string, number>();

  private key(userId: number, resourceId: number): string {
    return `${userId}:${resourceId}`;
  }

  record(userId: number, resourceId: number, reservationId: number, now: number): void {
    const key = this.key(userId, resourceId);
    if ((this.suppressed.get(key) ?? 0) > now) return;
    if (this.entries.size >= MAX_ENTRIES) this.prune(now);
    if (this.entries.size >= MAX_ENTRIES) this.entries.delete(this.entries.keys().next().value as string);
    this.entries.set(key, { reservationId, expiresAt: now + DECISION_TTL_MS });
  }

  /** The reservation id still awaiting a decision, or null (expired entries are dropped). */
  get(userId: number, resourceId: number, now: number): number | null {
    const key = this.key(userId, resourceId);
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return null;
    }
    return entry.reservationId;
  }

  clear(userId: number, resourceId: number): void {
    this.entries.delete(this.key(userId, resourceId));
  }

  /** Clears and blocks re-recording for a few seconds (reader answered in place). */
  clearAndSuppress(userId: number, resourceId: number, now: number): void {
    this.clear(userId, resourceId);
    this.suppressed.set(this.key(userId, resourceId), now + SUPPRESS_MS);
  }

  private prune(now: number): void {
    for (const [key, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(key);
    for (const [key, until] of this.suppressed) if (until <= now) this.suppressed.delete(key);
  }
}
