import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsPositive } from 'class-validator';
import { ExactlyOneOf } from '../validators/exactly-one-of.validator';

/**
 * Config for TIME_INTERVAL trigger. Exactly one mode:
 * - Recurring: set intervalDays (e.g. every 30 days). Baseline = when last maintenance for this schedule was done.
 * - Wall-clock threshold: set thresholdHours. Baseline = when last maintenance for this schedule was done.
 */
export class TimeIntervalTriggerConfigDto {
  @ExactlyOneOf(['intervalDays', 'thresholdHours'], {
    message: 'Exactly one of intervalDays or thresholdHours must be set (and positive).',
  })
  @ApiProperty({
    description: 'Recurring: trigger every N days (e.g. 30 for monthly)',
    required: false,
    example: 30,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  intervalDays?: number; // validated together with thresholdHours by ExactlyOneOf

  @ApiProperty({
    description: 'Wall-clock: trigger after this many hours since last maintenance done for this schedule',
    required: false,
    example: 500,
    minimum: 0.01,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  thresholdHours?: number;
}
