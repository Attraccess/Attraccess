import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsPositive } from 'class-validator';
import { UsageDurationUnit } from '@attraccess/database-entities';

/**
 * Config for USAGE_HOURS trigger. Baseline = when the last maintenance
 * created by this schedule was marked done.
 */
export class UsageHoursTriggerConfigDto {
  @ApiProperty({
    description: 'Duration value (combined with unit) for usage threshold',
    example: 100,
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
