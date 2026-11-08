import { HttpException, HttpStatus } from '@nestjs/common';

/** Typed 409 conflicts for booking rules (the response body is `{ code, message }`). */
export const BOOKING_CONFLICT_CODES = [
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
  'MAINTENANCE',
] as const;
export type BookingConflictCode = (typeof BOOKING_CONFLICT_CODES)[number];

/** Typed 409 conflicts for lifecycle actions on an existing reservation. */
export const STATE_CONFLICT_CODES = [
  'NOT_PENDING',
  'NOT_ACTIVE',
  'NOT_CANCELLABLE',
  'ALREADY_STARTED',
  'ALREADY_FINISHED',
  'FUTURE_BOOKINGS_EXIST',
] as const;
export type StateConflictCode = (typeof STATE_CONFLICT_CODES)[number];

export type ReservationErrorCode =
  | BookingConflictCode
  | StateConflictCode
  | 'INVALID_RANGE'
  | 'INVALID_SETTINGS'
  | 'INVALID_TIMEZONE'
  | 'RANGE_TOO_LARGE'
  | 'FEED_NOT_FOUND'
  | 'INVALID_FEED'
  | 'FEED_LIMIT'
  | 'FORBIDDEN'
  | 'RESERVATION_NOT_FOUND'
  | 'RESOURCE_NOT_FOUND';

const STATUS_BY_CODE: Partial<Record<ReservationErrorCode, HttpStatus>> = {
  INVALID_RANGE: HttpStatus.BAD_REQUEST,
  INVALID_SETTINGS: HttpStatus.BAD_REQUEST,
  INVALID_TIMEZONE: HttpStatus.BAD_REQUEST,
  RANGE_TOO_LARGE: HttpStatus.BAD_REQUEST,
  INVALID_FEED: HttpStatus.BAD_REQUEST,
  FEED_NOT_FOUND: HttpStatus.NOT_FOUND,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  RESERVATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  RESOURCE_NOT_FOUND: HttpStatus.NOT_FOUND,
};

/** HTTP error whose body is `{ code, message }` (409 for rule conflicts, see STATUS_BY_CODE). */
export class ReservationError extends HttpException {
  constructor(
    public readonly code: ReservationErrorCode,
    message: string,
    extra: Record<string, unknown> = {},
  ) {
    super({ code, message, ...extra }, STATUS_BY_CODE[code] ?? HttpStatus.CONFLICT);
  }
}
