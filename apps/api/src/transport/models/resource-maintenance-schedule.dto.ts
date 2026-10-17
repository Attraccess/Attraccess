import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.dto';
import { ResourceMaintenanceScheduleUsageHoursConfig } from './resource-maintenance-schedule-usage-hours-config.dto';
import { ResourceMaintenanceScheduleUsageCountConfig } from './resource-maintenance-schedule-usage-count-config.dto';
import { ResourceMaintenanceScheduleTimeIntervalConfig } from './resource-maintenance-schedule-time-interval-config.dto';
import {
  ResourceMaintenanceScheduleTriggerType,
  ResourceMaintenanceScheduleDurationBasis,
} from '@attraccess/application-models';
import type { ResponseFields } from '../response-mapper';

export class ResourceMaintenanceSchedule {
  @ApiProperty({
    description: 'The unique identifier of the maintenance schedule',
    example: 1,
  })
  id!: number;

  @ApiProperty({
    description: 'When the schedule was created',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'When the schedule was last updated',
  })
  updatedAt!: Date;

  @ApiProperty({
    description: 'The ID of the resource',
    example: 1,
  })
  resourceId!: number;

  resource!: Resource;

  @ApiProperty({
    description: 'Optional human-readable label for the schedule',
    required: false,
  })
  name!: string | null;

  @ApiProperty({
    description: 'The type of trigger for this schedule',
    enum: ResourceMaintenanceScheduleTriggerType,
    enumName: 'ResourceMaintenanceScheduleTriggerType',
  })
  triggerType!: ResourceMaintenanceScheduleTriggerType;

  @ApiProperty({
    description: 'The duration source used for USAGE_HOURS schedules',
    enum: ResourceMaintenanceScheduleDurationBasis,
    enumName: 'ResourceMaintenanceScheduleDurationBasis',
    default: ResourceMaintenanceScheduleDurationBasis.SESSION_DURATION,
  })
  durationBasis!: ResourceMaintenanceScheduleDurationBasis;

  @ApiProperty({ description: 'Config when triggerType is USAGE_HOURS', required: false })
  usageHoursConfig?: ResourceMaintenanceScheduleUsageHoursConfig | null;

  @ApiProperty({ description: 'Config when triggerType is USAGE_COUNT', required: false })
  usageCountConfig?: ResourceMaintenanceScheduleUsageCountConfig | null;

  @ApiProperty({ description: 'Config when triggerType is TIME_INTERVAL', required: false })
  timeIntervalConfig?: ResourceMaintenanceScheduleTimeIntervalConfig | null;

  @ApiProperty({
    description: 'Whether the schedule is enabled',
    example: true,
    default: true,
  })
  enabled!: boolean;
  static readonly responseFields: ResponseFields = {
    id: null,
    createdAt: null,
    updatedAt: null,
    resourceId: null,
    resource: () => Resource,
    name: null,
    triggerType: null,
    durationBasis: null,
    usageHoursConfig: () => ResourceMaintenanceScheduleUsageHoursConfig,
    usageCountConfig: () => ResourceMaintenanceScheduleUsageCountConfig,
    timeIntervalConfig: () => ResourceMaintenanceScheduleTimeIntervalConfig,
    enabled: null,
  };
}

export {
  ResourceMaintenanceScheduleTriggerType,
  ResourceMaintenanceScheduleDurationBasis,
} from '@attraccess/application-models';
