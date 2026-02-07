import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive } from 'class-validator';

/**
 * Config for USAGE_HOURS trigger. Baseline = when the last maintenance
 * created by this schedule was marked done.
 */
export class UsageHoursTriggerConfigDto {
  @ApiProperty({
    description: 'Trigger after this many minutes of resource usage (since last maintenance done for this schedule)',
    example: 6000,
    minimum: 1,
  })
  @IsInt()
  @IsPositive()
  thresholdMinutes!: number;
}
