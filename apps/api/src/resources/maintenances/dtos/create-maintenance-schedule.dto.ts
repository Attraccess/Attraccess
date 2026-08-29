import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDefined,
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
 * DTO for creating a maintenance schedule. Config is validated according to triggerType.
 * Baseline for all trigger types: when the last maintenance created by this schedule was marked done.
 */
export class CreateMaintenanceScheduleDto {
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
  })
  @IsEnum(ResourceMaintenanceScheduleTriggerType)
  triggerType!: ResourceMaintenanceScheduleTriggerType;

  @ApiProperty({
    description: 'The duration source used for USAGE_HOURS schedules',
    enum: ResourceMaintenanceScheduleDurationBasis,
    enumName: 'ResourceMaintenanceScheduleDurationBasis',
    required: false,
    default: ResourceMaintenanceScheduleDurationBasis.SESSION_DURATION,
  })
  @IsOptional()
  @IsEnum(ResourceMaintenanceScheduleDurationBasis)
  durationBasis?: ResourceMaintenanceScheduleDurationBasis;

  @ValidateIf((o: CreateMaintenanceScheduleDto) => o.triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_HOURS)
  @IsDefined()
  @ValidateNested()
  @Type(() => UsageHoursTriggerConfigDto)
  @ApiProperty({
    description: 'Required when triggerType is USAGE_HOURS',
    required: false,
    type: UsageHoursTriggerConfigDto,
  })
  usageHoursConfig?: UsageHoursTriggerConfigDto;

  @ValidateIf((o: CreateMaintenanceScheduleDto) => o.triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_COUNT)
  @IsDefined()
  @ValidateNested()
  @Type(() => UsageCountTriggerConfigDto)
  @ApiProperty({
    description: 'Required when triggerType is USAGE_COUNT',
    required: false,
    type: UsageCountTriggerConfigDto,
  })
  usageCountConfig?: UsageCountTriggerConfigDto;

  @ValidateIf((o: CreateMaintenanceScheduleDto) => o.triggerType === ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL)
  @IsDefined()
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
    example: true,
    default: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
