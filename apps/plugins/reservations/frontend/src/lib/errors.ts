import { ReservationsApiError } from '../api';

const KNOWN_CODES = new Set([
  'RESERVATIONS_DISABLED',
  'NOT_ALLOWED_TO_BOOK',
  'IN_THE_PAST',
  'OFF_TIME_STEP',
  'DURATION_TOO_SHORT',
  'DURATION_TOO_LONG',
  'BEYOND_MAX_ADVANCE',
  'LEAD_TIME_TOO_SHORT',
  'OUTSIDE_BOOKABLE_HOURS',
  'USER_BOOKING_LIMIT',
  'OVERLAP',
  'OWN_OVERLAP',
  'MAINTENANCE',
  'NOT_PENDING',
  'NOT_ACTIVE',
  'NOT_CANCELLABLE',
  'ALREADY_STARTED',
  'ALREADY_FINISHED',
  'FUTURE_BOOKINGS_EXIST',
  'INVALID_RANGE',
  'INVALID_SETTINGS',
  'INVALID_TIMEZONE',
  'RANGE_TOO_LARGE',
  'FORBIDDEN',
  'RESERVATION_NOT_FOUND',
  'RESOURCE_NOT_FOUND',
  'FEED_LIMIT',
  'FEED_NOT_FOUND',
  'INVALID_FEED',
]);

type Translate = (key: string, data?: Record<string, unknown>) => string;

/** What the caller knows about the resource the code refers to. */
export interface ErrorHints {
  /** Effective session limit; above 1 an OVERLAP means every slot is booked, not "another booking". */
  slots?: number;
}

const keyOf = (code: string, hints?: ErrorHints) =>
  code === 'OVERLAP' && (hints?.slots ?? 1) > 1 ? 'errors.OVERLAP_FULL' : `errors.${code}`;

/** Localised text for a known error code (e.g. the reason a booking is not possible), else the raw text. */
export function describeCode(code: string, t: Translate, hints?: ErrorHints): string {
  return KNOWN_CODES.has(code) ? t(keyOf(code, hints), { count: 0 }) : code;
}

/** Localised text for an API failure: a typed code wins, then the HTTP status, then the raw message. */
export function describeError(error: unknown, t: Translate, hints?: ErrorHints): string {
  if (error instanceof ReservationsApiError) {
    if (error.code && KNOWN_CODES.has(error.code)) {
      return t(keyOf(error.code, hints), { count: error.count ?? 0 });
    }
    if (error.status === 403) return t('errors.FORBIDDEN');
    if (error.status === 404) return t('errors.NOT_FOUND');
    return error.message || t('errors.generic');
  }
  return error instanceof Error && error.message ? error.message : t('errors.generic');
}
