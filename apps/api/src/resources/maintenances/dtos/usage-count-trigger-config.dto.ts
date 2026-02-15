import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive } from 'class-validator';

/**
 * Config for USAGE_COUNT trigger. Baseline = when the last maintenance
 * created by this schedule was marked done.
 */
export class UsageCountTriggerConfigDto {
  @ApiProperty({
    description: 'Trigger after this many usage sessions (since last maintenance done for this schedule)',
    example: 50,
    minimum: 1,
  })
  @IsInt()
  @IsPositive()
  thresholdSessions!: number;
}
