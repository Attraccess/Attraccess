import { ResourceType } from '@attraccess/plugins-backend-sdk';
import { type BlockedSpan, blockedSpan } from './rules';

/** The booking fields the capacity rules read. */
export interface CapacityBooking {
  id: number;
  userId: number;
  startTime: Date;
  endTime: Date;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  createdAt: Date;
}

/** Effective number of parallel sessions of a resource (core's `sessionLimitOf`): machines only, minimum 1. */
export function sessionLimitOf(resource: { type: ResourceType; maxParallelSessions?: number | null } | null): number {
  return resource?.type === ResourceType.Machine ? Math.max(1, resource.maxParallelSessions ?? 1) : 1;
}

/**
 * Highest number of `spans` that are open at the same instant inside `window` (half-open spans, so one ending
 * where another starts do not count together). Two spans that do not overlap each other count as one.
 */
export function peakConcurrency(spans: BlockedSpan[], window: BlockedSpan): number {
  const from = window.start.getTime();
  const to = window.end.getTime();
  const events: Array<[number, number]> = [];
  for (const span of spans) {
    const start = Math.max(span.start.getTime(), from);
    const end = Math.min(span.end.getTime(), to);
    if (start >= end) continue;
    events.push([start, 1], [end, -1]);
  }
  // Ends sort before starts at the same instant.
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let open = 0;
  let peak = 0;
  for (const [, delta] of events) {
    open += delta;
    peak = Math.max(peak, open);
  }
  return peak;
}

/** Whether one more booking with this span would push the concurrency above `limit` at some instant. */
export function exceedsCapacity(occupying: BlockedSpan[], candidate: BlockedSpan, limit: number): boolean {
  return peakConcurrency(occupying, candidate) + 1 > limit;
}

/**
 * Bookings that hold a slot at `at`: confirmed bookings of other users than the starter that run at `at`
 * (`start <= at < end`, no buffers) and whose holder has no session (a holder in session is counted through the
 * session). One slot per person. Ordered by end time, then start: the first one is the one to name in texts.
 */
export function heldBookings<T extends CapacityBooking>(args: {
  confirmed: T[];
  starterId: number;
  inSession: ReadonlySet<number>;
  at: Date;
  overridden?: ReadonlySet<number>;
}): T[] {
  const at = args.at.getTime();
  const seen = new Set<number>();
  return args.confirmed
    .filter(
      (b) =>
        b.userId !== args.starterId &&
        b.startTime.getTime() <= at &&
        at < b.endTime.getTime() &&
        !args.inSession.has(b.userId) &&
        !args.overridden?.has(b.id),
    )
    .sort((a, b) => a.endTime.getTime() - b.endTime.getTime() || a.startTime.getTime() - b.startTime.getTime())
    .filter((b) => !seen.has(b.userId) && !!seen.add(b.userId));
}

/**
 * The bookings to cancel after the limit dropped to `limit`: while some instant has more occupying bookings than
 * slots, the most recently created booking that has not started yet and covers that instant goes first (ties by
 * id, highest first). Running bookings count but are never picked; an instant that only running bookings
 * overfill stays as it is. `occupying` is every pending/confirmed booking that ends after `now`.
 */
export function selectExcessBookings<T extends CapacityBooking>(occupying: T[], limit: number, now: Date): T[] {
  const remaining = [...occupying];
  const cancelled: T[] = [];
  const spanOf = new Map(remaining.map((b) => [b, blockedSpan(b)]));
  const hasStarted = (b: T) => b.startTime.getTime() <= now.getTime();
  for (;;) {
    const instants = [...new Set(remaining.map((b) => (spanOf.get(b) as BlockedSpan).start.getTime()))].sort(
      (a, b) => a - b,
    );
    let victim: T | null = null;
    for (const t of instants) {
      const covering = remaining.filter((b) => {
        const span = spanOf.get(b) as BlockedSpan;
        return span.start.getTime() <= t && t < span.end.getTime();
      });
      if (covering.length <= limit) continue;
      const removable = covering
        .filter((b) => !hasStarted(b))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id);
      if (removable.length === 0) continue;
      victim = removable[0];
      break;
    }
    if (!victim) return cancelled;
    cancelled.push(victim);
    remaining.splice(remaining.indexOf(victim), 1);
  }
}
