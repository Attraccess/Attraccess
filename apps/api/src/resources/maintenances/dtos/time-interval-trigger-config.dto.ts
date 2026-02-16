import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsPositive } from 'class-validator';
import { UsageDurationUnit } from '@attraccess/database-entities';

/**
 * Config for TIME_INTERVAL trigger. Uses duration + unit (same pattern as USAGE_HOURS).
 * Trigger after N duration (in unit) has passed since baseline (wall-clock).
 * Baseline = when last maintenance for this schedule was done.
 */
export class TimeIntervalTriggerConfigDto {
  @ApiProperty({
    description: 'Duration value (combined with unit)',
    example: 500,
    minimum: 1,
  })
  @IsInt()
  @IsPositive()
  duration!: number;

  @ApiProperty({
    description: 'Unit for duration (MINUTES, HOURS, or DAYS)',
    enum: UsageDurationUnit,
    enumName: 'UsageDurationUnit',
  })
  @IsEnum(UsageDurationUnit)
  unit!: UsageDurationUnit;
}
