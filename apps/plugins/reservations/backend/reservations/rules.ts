import type { ResourceSettings } from '../settings/settings.model';
import { isWithinBookableHours } from '../time/bookable-hours';
import { isWholeMinute, localMinutesOfDay } from '../time/zone';
import { ReservationError } from './errors';

const MINUTE_MS = 60_000;
/** Tolerance for client clocks running slightly behind: a start up to this far in the past is still "now". */
export const PAST_TOLERANCE_MS = MINUTE_MS;

export interface BlockedSpan {
  start: Date;
  end: Date;
}

/** Time a booking occupies including its buffers. */
export function blockedSpan(booking: {
  startTime: Date;
  endTime: Date;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
}): BlockedSpan {
  return {
    start: new Date(booking.startTime.getTime() - booking.bufferBeforeMinutes * MINUTE_MS),
    end: new Date(booking.endTime.getTime() + booking.bufferAfterMinutes * MINUTE_MS),
  };
}

export function spansOverlap(a: BlockedSpan, b: BlockedSpan): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

/**
 * Pure per-booking rule check (everything that needs no other bookings): range, past, step grid,
 * duration, advance, lead time and bookable hours. Returns the first violated rule as an error.
 */
export function checkBookingRules(args: {
  settings: ResourceSettings;
  timeZone: string;
  start: Date;
  end: Date;
  now: Date;
}): ReservationError | null {
  const { settings, timeZone, start, end, now } = args;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    return new ReservationError('INVALID_RANGE', 'The end must be after the start');
  }
  if (start.getTime() < now.getTime() - PAST_TOLERANCE_MS) {
    return new ReservationError('IN_THE_PAST', 'The booking starts in the past');
  }
  const step = settings.timeStepMinutes;
  const durationMinutes = (end.getTime() - start.getTime()) / MINUTE_MS;
  const onGrid =
    isWholeMinute(start) &&
    isWholeMinute(end) &&
    localMinutesOfDay(start, timeZone) % step === 0 &&
    durationMinutes % step === 0;
  if (!onGrid) {
    return new ReservationError('OFF_TIME_STEP', `Start and duration must be a multiple of ${step} minutes`);
  }
  if (durationMinutes < settings.minDurationMinutes) {
    return new ReservationError('DURATION_TOO_SHORT', `The minimum duration is ${settings.minDurationMinutes} minutes`);
  }
  if (durationMinutes > settings.maxDurationMinutes) {
    return new ReservationError('DURATION_TOO_LONG', `The maximum duration is ${settings.maxDurationMinutes} minutes`);
  }
  if (start.getTime() > now.getTime() + settings.maxAdvanceDays * 86_400_000) {
    return new ReservationError(
      'BEYOND_MAX_ADVANCE',
      `Bookings can be made at most ${settings.maxAdvanceDays} days ahead`,
    );
  }
  // With no lead requirement the clock tolerance above is the only limit on how close to now a start may be.
  if (settings.minLeadMinutes > 0 && start.getTime() < now.getTime() + settings.minLeadMinutes * MINUTE_MS) {
    return new ReservationError(
      'LEAD_TIME_TOO_SHORT',
      `Bookings must be made at least ${settings.minLeadMinutes} minutes before they start`,
    );
  }
  const span = blockedSpan({
    startTime: start,
    endTime: end,
    bufferBeforeMinutes: settings.bufferBeforeMinutes,
    bufferAfterMinutes: settings.bufferAfterMinutes,
  });
  if (!isWithinBookableHours(settings.bookableHours, timeZone, span.start, span.end)) {
    return new ReservationError('OUTSIDE_BOOKABLE_HOURS', 'The booking is outside the bookable hours');
  }
  return null;
}
