import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { INTEGER_RANGES, WHO_CAN_BOOK, WhoCanBook } from '../settings/settings.model';
import { BOOKABLE_HOURS_SCHEMA } from './dto.response';

export class CreateReservationBody {
  @ApiProperty({ type: Number })
  @IsInt()
  @Min(1)
  resourceId!: number;

  @ApiProperty({ type: String, format: 'date-time', description: 'ISO 8601; stored as UTC' })
  @IsISO8601()
  startTime!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Either endTime or durationMinutes' })
  @IsOptional()
  @IsISO8601()
  endTime?: string;

  @ApiPropertyOptional({ type: Number, description: 'Either endTime or durationMinutes' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10080)
  durationMinutes?: number;

  @ApiPropertyOptional({ type: String, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReasonBody {
  @ApiPropertyOptional({ type: String, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

const intSetting = (key: keyof typeof INTEGER_RANGES) => ({
  type: Number,
  required: false,
  minimum: INTEGER_RANGES[key][0],
  maximum: INTEGER_RANGES[key][1],
});

/** All fields optional: only supplied settings change. Cross-field rules are validated server-side. */
export class UpdateResourceSettingsBody {
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  approvalRequired?: boolean;

  @ApiProperty(intSetting('timeStepMinutes'))
  @IsOptional()
  @IsInt()
  timeStepMinutes?: number;

  @ApiProperty(intSetting('minDurationMinutes'))
  @IsOptional()
  @IsInt()
  minDurationMinutes?: number;

  @ApiProperty(intSetting('maxDurationMinutes'))
  @IsOptional()
  @IsInt()
  maxDurationMinutes?: number;

  @ApiProperty(intSetting('maxAdvanceDays'))
  @IsOptional()
  @IsInt()
  maxAdvanceDays?: number;

  @ApiProperty(intSetting('minLeadMinutes'))
  @IsOptional()
  @IsInt()
  minLeadMinutes?: number;

  @ApiProperty(intSetting('bufferBeforeMinutes'))
  @IsOptional()
  @IsInt()
  bufferBeforeMinutes?: number;

  @ApiProperty(intSetting('bufferAfterMinutes'))
  @IsOptional()
  @IsInt()
  bufferAfterMinutes?: number;

  @ApiProperty(intSetting('maxActiveBookingsPerUser'))
  @IsOptional()
  @IsInt()
  maxActiveBookingsPerUser?: number;

  @ApiPropertyOptional({ enum: WHO_CAN_BOOK })
  @IsOptional()
  @IsIn([...WHO_CAN_BOOK])
  whoCanBook?: WhoCanBook;

  @ApiProperty(intSetting('confirmWindowMinutes'))
  @IsOptional()
  @IsInt()
  confirmWindowMinutes?: number;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  checkInEnabled?: boolean;

  @ApiProperty(intSetting('checkInGraceMinutes'))
  @IsOptional()
  @IsInt()
  checkInGraceMinutes?: number;

  @ApiProperty(intSetting('earlyCheckInMinutes'))
  @IsOptional()
  @IsInt()
  earlyCheckInMinutes?: number;

  @ApiProperty(intSetting('handoverReminderMinutes'))
  @IsOptional()
  @IsInt()
  handoverReminderMinutes?: number;

  @ApiPropertyOptional(BOOKABLE_HOURS_SCHEMA)
  @IsOptional()
  @IsObject()
  bookableHours?: Record<string, { start: string; end: string }[]>;

  @ApiPropertyOptional({
    type: Boolean,
    description:
      'Required when disabling a resource that has future bookings: true cancels them (reason "reservations disabled", holders are notified), false keeps them. Omitting it answers 409 FUTURE_BOOKINGS_EXIST.',
  })
  @IsOptional()
  @IsBoolean()
  cancelFutureBookings?: boolean;
}

export class UpdateGlobalSettingsBody {
  @ApiProperty({ type: String, example: 'Europe/Berlin', description: 'IANA timezone' })
  @IsString()
  @MaxLength(100)
  timezone!: string;
}
