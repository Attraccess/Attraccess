import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RESERVATION_STATUSES, ReservationStatus } from '../entities/reservation.entity';
import { BOOKING_CONFLICT_CODES, STATE_CONFLICT_CODES } from '../reservations/errors';
import { INTEGER_RANGES, WHO_CAN_BOOK, WhoCanBook } from '../settings/settings.model';

const ALL_ERROR_CODES = [
  ...BOOKING_CONFLICT_CODES,
  ...STATE_CONFLICT_CODES,
  'INVALID_RANGE',
  'INVALID_SETTINGS',
  'INVALID_TIMEZONE',
  'RANGE_TOO_LARGE',
  'FEED_NOT_FOUND',
  'INVALID_FEED',
  'FEED_LIMIT',
  'FORBIDDEN',
  'RESERVATION_NOT_FOUND',
  'RESOURCE_NOT_FOUND',
];

/** Body of every error response of this plugin (409 for booking/state conflicts). */
export class ReservationErrorDto {
  @ApiProperty({ enum: ALL_ERROR_CODES, description: 'Stable machine-readable code' })
  code!: string;

  @ApiProperty({ type: String })
  message!: string;

  @ApiPropertyOptional({ type: Number, description: 'FUTURE_BOOKINGS_EXIST: how many bookings would be cancelled' })
  count?: number;
}

/**
 * A booking. Holder identity (userId, userName), note and decision details are only filled for the
 * holder and managers of the resource; everybody else sees times and buffers only.
 */
export class ReservationDto {
  @ApiProperty({ type: Number })
  id!: number;

  @ApiProperty({ type: Number })
  resourceId!: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  resourceName!: string | null;

  @ApiProperty({ type: String, format: 'date-time', description: 'UTC' })
  startTime!: string;

  @ApiProperty({ type: String, format: 'date-time', description: 'UTC' })
  endTime!: string;

  @ApiProperty({ type: Number })
  bufferBeforeMinutes!: number;

  @ApiProperty({ type: Number })
  bufferAfterMinutes!: number;

  @ApiProperty({ enum: RESERVATION_STATUSES })
  status!: ReservationStatus;

  @ApiProperty({ type: Boolean, description: 'The calling user holds this booking' })
  mine!: boolean;

  @ApiProperty({ type: Number, nullable: true, description: 'null unless holder or manager' })
  userId!: number | null;

  @ApiProperty({ type: String, nullable: true, description: 'null unless holder or manager' })
  userName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  note!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  createdAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  endedEarlyAt!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  cancelledBy!: number | null;

  @ApiProperty({ type: String, nullable: true })
  cancelReason!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  decidedBy!: number | null;

  @ApiProperty({ type: String, nullable: true })
  decisionReason!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  decidedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  checkedInAt!: string | null;

  @ApiProperty({ type: Boolean })
  canCancel!: boolean;

  @ApiProperty({ type: Boolean })
  canEndEarly!: boolean;

  @ApiProperty({ type: Boolean, description: 'Holder may answer "keep this booking"' })
  canKeep!: boolean;

  @ApiProperty({ type: Boolean, description: 'Manager may approve or reject' })
  canDecide!: boolean;
}

export class ManagedReservationListDto {
  @ApiProperty({ type: () => [ReservationDto] })
  items!: ReservationDto[];

  @ApiProperty({ type: Number })
  total!: number;

  @ApiProperty({ type: Number })
  page!: number;

  @ApiProperty({ type: Number })
  pageSize!: number;
}

export const BOOKABLE_HOURS_SCHEMA = {
  type: 'object',
  description: 'Weekday (sun..sat) to HH:mm ranges; every weekday empty means bookable 24/7',
  additionalProperties: {
    type: 'array',
    items: {
      type: 'object',
      properties: { start: { type: 'string', example: '09:00' }, end: { type: 'string', example: '24:00' } },
    },
  },
} as const;

export class BookableRangeDto {
  @ApiProperty({ type: String, example: '09:00' })
  start!: string;

  @ApiProperty({ type: String, example: '24:00', description: 'HH:mm, 24:00 joins the next day' })
  end!: string;
}

/** Settings of one resource. `bookableHours` maps `sun`..`sat` to ranges; all-empty = 24/7. */
export class ResourceSettingsDto {
  @ApiProperty({ type: Number })
  resourceId!: number;

  @ApiProperty({ type: Boolean })
  enabled!: boolean;

  @ApiProperty({ type: Boolean })
  approvalRequired!: boolean;

  @ApiProperty({ type: Number, minimum: INTEGER_RANGES.timeStepMinutes[0], maximum: INTEGER_RANGES.timeStepMinutes[1] })
  timeStepMinutes!: number;

  @ApiProperty({ type: Number })
  minDurationMinutes!: number;

  @ApiProperty({ type: Number })
  maxDurationMinutes!: number;

  @ApiProperty({ type: Number })
  maxAdvanceDays!: number;

  @ApiProperty({ type: Number })
  minLeadMinutes!: number;

  @ApiProperty({ type: Number })
  bufferBeforeMinutes!: number;

  @ApiProperty({ type: Number })
  bufferAfterMinutes!: number;

  @ApiProperty({ type: Number, description: '0 = unlimited' })
  maxActiveBookingsPerUser!: number;

  @ApiProperty({ enum: WHO_CAN_BOOK })
  whoCanBook!: WhoCanBook;

  @ApiProperty({ type: Number, description: '0 = never ask' })
  confirmWindowMinutes!: number;

  @ApiProperty({ type: Boolean })
  checkInEnabled!: boolean;

  @ApiProperty({ type: Number })
  checkInGraceMinutes!: number;

  @ApiProperty({ type: Number })
  earlyCheckInMinutes!: number;

  @ApiProperty({ type: Number })
  handoverReminderMinutes!: number;

  @ApiProperty(BOOKABLE_HOURS_SCHEMA)
  bookableHours!: Record<string, BookableRangeDto[]>;
}

export class UpdatedResourceSettingsDto {
  @ApiProperty({ type: () => ResourceSettingsDto })
  settings!: ResourceSettingsDto;

  @ApiProperty({ type: Number, description: 'Bookings cancelled because reservations were disabled' })
  cancelledBookings!: number;
}

export class FutureBookingsCountDto {
  @ApiProperty({ type: Number })
  count!: number;
}

export class ManagerAccessDto {
  @ApiProperty({ type: Boolean })
  isManager!: boolean;
}

export class GlobalSettingsDto {
  @ApiProperty({ type: String, example: 'Europe/Berlin', description: 'IANA timezone' })
  timezone!: string;

  @ApiProperty({ type: String, description: "The server's timezone (the default)" })
  defaultTimezone!: string;
}

export class CanBookDto {
  @ApiProperty({ type: Boolean })
  allowed!: boolean;

  @ApiProperty({ enum: [...BOOKING_CONFLICT_CODES], nullable: true, description: 'Why booking is not possible' })
  reason!: string | null;
}

/** The subset of the settings a booking dialog needs. */
export class PublicBookingRulesDto {
  @ApiProperty({ type: Boolean })
  approvalRequired!: boolean;

  @ApiProperty({ type: Number })
  timeStepMinutes!: number;

  @ApiProperty({ type: Number })
  minDurationMinutes!: number;

  @ApiProperty({ type: Number })
  maxDurationMinutes!: number;

  @ApiProperty({ type: Number })
  maxAdvanceDays!: number;

  @ApiProperty({ type: Number })
  minLeadMinutes!: number;

  @ApiProperty({ type: Number })
  bufferBeforeMinutes!: number;

  @ApiProperty({ type: Number })
  bufferAfterMinutes!: number;

  @ApiProperty({ type: Number })
  maxActiveBookingsPerUser!: number;

  @ApiProperty({ enum: WHO_CAN_BOOK })
  whoCanBook!: WhoCanBook;

  @ApiProperty({ type: Boolean })
  checkInEnabled!: boolean;

  @ApiProperty({ type: Number })
  checkInGraceMinutes!: number;

  @ApiProperty({ type: Number })
  earlyCheckInMinutes!: number;

  @ApiProperty(BOOKABLE_HOURS_SCHEMA)
  bookableHours!: Record<string, BookableRangeDto[]>;
}

export class MaintenanceSpanDto {
  @ApiProperty({ type: String, format: 'date-time' })
  startTime!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'null = open-ended' })
  endTime!: string | null;
}

export class AvailabilityDto {
  @ApiProperty({ type: Number })
  resourceId!: number;

  @ApiProperty({ type: Boolean })
  enabled!: boolean;

  @ApiProperty({ type: String, description: 'IANA timezone used for hours and the step grid' })
  timezone!: string;

  @ApiProperty({
    type: Boolean,
    description: 'Caller manages the resource; always false while reservations are disabled',
  })
  isManager!: boolean;

  @ApiProperty({
    type: () => CanBookDto,
    description:
      'Whether the caller may book now: RESERVATIONS_DISABLED, NOT_ALLOWED_TO_BOOK, or USER_BOOKING_LIMIT when the caller already holds maxActiveBookingsPerUser pending/confirmed bookings that have not ended',
  })
  canBook!: CanBookDto;

  @ApiProperty({ type: () => PublicBookingRulesDto })
  rules!: PublicBookingRulesDto;

  @ApiProperty({
    type: () => [ReservationDto],
    description:
      'Pending and confirmed bookings whose blocked span [startTime - their bufferBeforeMinutes, endTime + their bufferAfterMinutes) overlaps [from - rules.bufferBeforeMinutes, to + rules.bufferAfterMinutes): every booking a new booking inside [from, to) can collide with, including ones just outside the range',
  })
  reservations!: ReservationDto[];

  @ApiProperty({
    type: () => [MaintenanceSpanDto],
    description:
      'Maintenance windows overlapping [from - rules.bufferBeforeMinutes, to + rules.bufferAfterMinutes). A booking conflicts when its span including its buffers overlaps one',
  })
  maintenance!: MaintenanceSpanDto[];
}
