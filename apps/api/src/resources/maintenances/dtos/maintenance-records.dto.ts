import { ApiProperty } from '@nestjs/swagger';
import {
  MaintenanceRequestStatus,
  ResourceMaintenanceScheduleDurationBasis,
  ResourceMaintenanceScheduleTriggerType,
  UsageDurationUnit,
} from '@attraccess/application-models';
import { ResourceActorUserDto } from './resource-actor-user.dto';

/*
 * Response shapes of the maintenance endpoints. The class names are the OpenAPI schema names the generated client
 * and the frontend already use, so they stay what the former entity responses were called.
 */

export class ResourceMaintenanceScheduleUsageHoursConfig {
  @ApiProperty({ description: 'Unique identifier', example: 1 })
  id!: number;

  @ApiProperty({ description: 'Schedule this config belongs to', example: 1 })
  scheduleId!: number;

  @ApiProperty({ description: 'Trigger after this much usage (in unit)', example: 100 })
  duration!: number;

  @ApiProperty({ description: 'Unit of the duration', enum: UsageDurationUnit, enumName: 'UsageDurationUnit' })
  unit!: UsageDurationUnit;
}

export class ResourceMaintenanceScheduleUsageCountConfig {
  @ApiProperty({ description: 'Unique identifier', example: 1 })
  id!: number;

  @ApiProperty({ description: 'Schedule this config belongs to', example: 1 })
  scheduleId!: number;

  @ApiProperty({
    description: 'Trigger after this many usage sessions (since last maintenance done for this schedule)',
    example: 50,
  })
  thresholdSessions!: number;
}

export class ResourceMaintenanceScheduleTimeIntervalConfig {
  @ApiProperty({ description: 'Unique identifier', example: 1 })
  id!: number;

  @ApiProperty({ description: 'Schedule this config belongs to', example: 1 })
  scheduleId!: number;

  @ApiProperty({ description: 'Trigger after this much time (in unit) since the last maintenance', example: 30 })
  duration!: number;

  @ApiProperty({ description: 'Unit of the duration', enum: UsageDurationUnit, enumName: 'UsageDurationUnit' })
  unit!: UsageDurationUnit;
}

export class ResourceMaintenanceSchedule {
  @ApiProperty({ description: 'The unique identifier of the maintenance schedule', example: 1 })
  id!: number;

  @ApiProperty({ description: 'When the schedule was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'When the schedule was last updated' })
  updatedAt!: Date;

  @ApiProperty({ description: 'The ID of the resource', example: 1 })
  resourceId!: number;

  @ApiProperty({ description: 'Optional human-readable label for the schedule', required: false })
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

  @ApiProperty({ description: 'Whether the schedule is enabled', example: true, default: true })
  enabled!: boolean;
}

export class ResourceMaintenance {
  @ApiProperty({ description: 'The unique identifier of the maintenance', example: 1 })
  id!: number;

  @ApiProperty({ description: 'When the maintenance was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'When the maintenance was last updated' })
  updatedAt!: Date;

  @ApiProperty({ description: 'The ID of the resource', example: 1 })
  resourceId!: number;

  @ApiProperty({
    description: 'When the maintenance started',
    type: String,
    example: '2025-01-01T00:00:00.000Z',
    format: 'date-time',
  })
  startTime!: Date;

  @ApiProperty({
    description: 'When the maintenance ended (null if not ended yet)',
    required: false,
    type: String,
    example: '2025-01-01T00:00:00.000Z',
    nullable: true,
    format: 'date-time',
  })
  endTime!: Date | null;

  @ApiProperty({ description: 'The reason for the maintenance', required: false })
  reason!: string | null;

  @ApiProperty({
    description: 'The user who created/started the maintenance record',
    required: false,
    type: () => ResourceActorUserDto,
  })
  createdByUser?: ResourceActorUserDto | null;

  @ApiProperty({
    description: 'The user who marked the maintenance as done',
    required: false,
    type: () => ResourceActorUserDto,
  })
  completedByUser?: ResourceActorUserDto | null;

  @ApiProperty({
    description: 'When the maintenance was marked as done',
    required: false,
    type: String,
    nullable: true,
    format: 'date-time',
  })
  completedAt!: Date | null;

  @ApiProperty({
    description: 'The schedule that triggered this maintenance (null for manual)',
    required: false,
    type: () => ResourceMaintenanceSchedule,
  })
  maintenanceSchedule?: ResourceMaintenanceSchedule | null;
}

export class ResourceMaintenanceRequest {
  @ApiProperty({ description: 'The unique identifier of the maintenance request', example: 1 })
  id!: number;

  @ApiProperty({ description: 'When the request was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'When the request was last updated' })
  updatedAt!: Date;

  @ApiProperty({ description: 'The ID of the resource the request is for', example: 1 })
  resourceId!: number;

  @ApiProperty({
    description: 'Why the user thinks the resource needs maintenance',
    example: 'The spindle makes a grinding noise and stops mid-cut.',
  })
  reason!: string;

  @ApiProperty({
    description: 'The current status of the request',
    enum: MaintenanceRequestStatus,
    enumName: 'MaintenanceRequestStatus',
    example: MaintenanceRequestStatus.OPEN,
  })
  status!: MaintenanceRequestStatus;

  @ApiProperty({
    description: 'The user who reported the resource as broken',
    required: false,
    type: () => ResourceActorUserDto,
  })
  createdByUser?: ResourceActorUserDto | null;

  @ApiProperty({
    description: 'The maintainer who resolved or dismissed the request',
    required: false,
    type: () => ResourceActorUserDto,
  })
  resolvedByUser?: ResourceActorUserDto | null;

  @ApiProperty({
    description: 'When the request was resolved or dismissed',
    required: false,
    type: String,
    nullable: true,
    format: 'date-time',
  })
  resolvedAt!: Date | null;

  @ApiProperty({
    description: 'The maintenance created from this request (null until converted)',
    required: false,
    type: () => ResourceMaintenance,
  })
  resultingMaintenance?: ResourceMaintenance | null;
}
