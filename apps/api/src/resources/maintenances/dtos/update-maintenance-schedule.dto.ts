import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ResourceMaintenanceScheduleDurationBasis,
  ResourceMaintenanceScheduleTriggerType,
} from '@attraccess/database-entities';
import { UsageHoursTriggerConfigDto } from './usage-hours-trigger-config.dto';
import { UsageCountTriggerConfigDto } from './usage-count-trigger-config.dto';
import { TimeIntervalTriggerConfigDto } from './time-interval-trigger-config.dto';

/**
 * DTO for updating a maintenance schedule. Only provided fields are updated.
 * When triggerType is provided, the matching config must be provided and valid.
 */
export class UpdateMaintenanceScheduleDto {
  @ApiProperty({
    description: 'Optional human-readable label for the schedule',
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string | null;

  @ApiProperty({
    description: 'The type of trigger for this schedule',
    enum: ResourceMaintenanceScheduleTriggerType,
    enumName: 'ResourceMaintenanceScheduleTriggerType',
    required: false,
  })
  @IsOptional()
  @IsEnum(ResourceMaintenanceScheduleTriggerType)
  triggerType?: ResourceMaintenanceScheduleTriggerType;

  @ApiProperty({
    description: 'The duration source used for USAGE_HOURS schedules',
    enum: ResourceMaintenanceScheduleDurationBasis,
    enumName: 'ResourceMaintenanceScheduleDurationBasis',
    required: false,
  })
  @IsOptional()
  @IsEnum(ResourceMaintenanceScheduleDurationBasis)
  durationBasis?: ResourceMaintenanceScheduleDurationBasis;

  @ValidateIf((o: UpdateMaintenanceScheduleDto) => o.triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_HOURS)
  @ValidateNested()
  @Type(() => UsageHoursTriggerConfigDto)
  @ApiProperty({
    description: 'Required when triggerType is USAGE_HOURS',
    required: false,
    type: UsageHoursTriggerConfigDto,
  })
  usageHoursConfig?: UsageHoursTriggerConfigDto;

  @ValidateIf((o: UpdateMaintenanceScheduleDto) => o.triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_COUNT)
  @ValidateNested()
  @Type(() => UsageCountTriggerConfigDto)
  @ApiProperty({
    description: 'Required when triggerType is USAGE_COUNT',
    required: false,
    type: UsageCountTriggerConfigDto,
  })
  usageCountConfig?: UsageCountTriggerConfigDto;

  @ValidateIf((o: UpdateMaintenanceScheduleDto) => o.triggerType === ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL)
  @ValidateNested()
  @Type(() => TimeIntervalTriggerConfigDto)
  @ApiProperty({
    description: 'Required when triggerType is TIME_INTERVAL (duration, unit, mode)',
    required: false,
    type: TimeIntervalTriggerConfigDto,
  })
  timeIntervalConfig?: TimeIntervalTriggerConfigDto;

  @ApiProperty({
    description: 'Whether the schedule is enabled',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
