// Client-side mirror of the booking rules, used to offer only valid start times and durations.
// The server stays authoritative: every violated rule has the same typed code it answers with.
import { type LocalDate, addLocalDays, isWithinBookableHours, localMinutesOfDay, wallClockToDate } from './time';
import type { BookingRules, MaintenanceSpan, Reservation } from './types';

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export type SlotViolation =
  | 'IN_THE_PAST'
  | 'OFF_TIME_STEP'
  | 'DURATION_TOO_SHORT'
  | 'DURATION_TOO_LONG'
  | 'BEYOND_MAX_ADVANCE'
  | 'LEAD_TIME_TOO_SHORT'
  | 'OUTSIDE_BOOKABLE_HOURS'
  | 'OVERLAP'
  | 'OWN_OVERLAP'
  | 'MAINTENANCE';

export interface SlotContext {
  rules: BookingRules;
  timezone: string;
  reservations: Reservation[];
  maintenance: MaintenanceSpan[];
  now: Date;
  /** Effective session limit of the resource; omitted means 1 (exclusive). */
  slots?: number;
}

const blocksSlot = (reservation: Reservation) => reservation.status === 'pending' || reservation.status === 'confirmed';

/** Highest number of spans running at the same instant inside [from, to); touching spans do not overlap. */
function peakConcurrency(spans: { start: number; end: number }[], from: number, to: number): number {
  const events = spans.flatMap((span) => [
    { at: Math.max(span.start, from), delta: 1 },
    { at: Math.min(span.end, to), delta: -1 },
  ]);
  events.sort((a, b) => a.at - b.at || a.delta - b.delta);
  let current = 0;
  let peak = 0;
  for (const event of events) {
    current += event.delta;
    peak = Math.max(peak, current);
  }
  return peak;
}

export function checkWindow(context: SlotContext, start: Date, end: Date): SlotViolation | null {
  const { rules, timezone, now } = context;
  const durationMinutes = (end.getTime() - start.getTime()) / MINUTE_MS;
  if (start.getTime() < now.getTime()) return 'IN_THE_PAST';
  if (
    localMinutesOfDay(start, timezone) % rules.timeStepMinutes !== 0 ||
    durationMinutes % rules.timeStepMinutes !== 0
  ) {
    return 'OFF_TIME_STEP';
  }
  if (durationMinutes < rules.minDurationMinutes) return 'DURATION_TOO_SHORT';
  if (durationMinutes > rules.maxDurationMinutes) return 'DURATION_TOO_LONG';
  if (start.getTime() > now.getTime() + rules.maxAdvanceDays * DAY_MS) return 'BEYOND_MAX_ADVANCE';
  if (start.getTime() < now.getTime() + rules.minLeadMinutes * MINUTE_MS) return 'LEAD_TIME_TOO_SHORT';
  const spanStart = new Date(start.getTime() - rules.bufferBeforeMinutes * MINUTE_MS);
  const spanEnd = new Date(end.getTime() + rules.bufferAfterMinutes * MINUTE_MS);
  if (!isWithinBookableHours(rules.bookableHours, timezone, spanStart, spanEnd)) return 'OUTSIDE_BOOKABLE_HOURS';
  const blocking = context.reservations
    .filter(blocksSlot)
    .map((reservation) => ({
      start: new Date(reservation.startTime).getTime() - reservation.bufferBeforeMinutes * MINUTE_MS,
      end: new Date(reservation.endTime).getTime() + reservation.bufferAfterMinutes * MINUTE_MS,
      mine: reservation.mine,
    }))
    .filter((span) => spanStart.getTime() < span.end && span.start < spanEnd.getTime());
  if (peakConcurrency(blocking, spanStart.getTime(), spanEnd.getTime()) + 1 > (context.slots ?? 1)) return 'OVERLAP';
  if (blocking.some((span) => span.mine)) return 'OWN_OVERLAP';
  // Like the server: the booking including its buffers must stay clear of maintenance.
  const inMaintenance = context.maintenance.some(
    (span) =>
      spanStart.getTime() < (span.endTime ? new Date(span.endTime).getTime() : Infinity) &&
      new Date(span.startTime).getTime() < spanEnd.getTime(),
  );
  return inMaintenance ? 'MAINTENANCE' : null;
}

/** Start times of one local day that allow at least the minimum duration. */
export function validStarts(context: SlotContext, day: LocalDate): Date[] {
  const { timeStepMinutes, minDurationMinutes } = context.rules;
  const dayStart = wallClockToDate(day, context.timezone);
  const nextDayStart = wallClockToDate(addLocalDays(day, 1), context.timezone);
  const result: Date[] = [];
  for (let minutes = 0; minutes < 1440; minutes += timeStepMinutes) {
    const start = wallClockToDate({ ...day, hour: Math.floor(minutes / 60), minute: minutes % 60 }, context.timezone);
    // Skip instants a DST change moved out of the day or onto an earlier grid point.
    if (start.getTime() < dayStart.getTime() || start.getTime() >= nextDayStart.getTime()) continue;
    if (result.length && start.getTime() <= result[result.length - 1].getTime()) continue;
    const end = new Date(start.getTime() + minDurationMinutes * MINUTE_MS);
    if (checkWindow(context, start, end) === null) result.push(start);
  }
  return result;
}

/**
 * Durations (minutes) bookable from `start`. Once a longer window collides with a booking,
 * maintenance or the bookable hours, every longer one does as well, so scanning stops there.
 */
export function validDurations(context: SlotContext, start: Date): number[] {
  const { timeStepMinutes, minDurationMinutes, maxDurationMinutes } = context.rules;
  const result: number[] = [];
  for (let minutes = minDurationMinutes; minutes <= maxDurationMinutes; minutes += timeStepMinutes) {
    const violation = checkWindow(context, start, new Date(start.getTime() + minutes * MINUTE_MS));
    if (violation !== null) break;
    result.push(minutes);
  }
  return result;
}
