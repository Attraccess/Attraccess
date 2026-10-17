import { ApiProperty } from '@nestjs/swagger';
import { ResourceMaintenanceSchedule } from './resource-maintenance-schedule.dto';
import { UsageDurationUnit } from '@attraccess/application-models';
import type { ResponseFields } from '../response-mapper';

/**
 * Config for TIME_INTERVAL trigger. Uses duration + unit (same as USAGE_HOURS).
 * Trigger after N duration (in unit) has passed since baseline (wall-clock).
 * Baseline = when last maintenance for this schedule was done.
 */

export class ResourceMaintenanceScheduleTimeIntervalConfig {
  @ApiProperty({ description: 'Unique identifier', example: 1 })
  id!: number;

  @ApiProperty({ description: 'Schedule this config belongs to', example: 1 })
  scheduleId!: number;

  schedule!: ResourceMaintenanceSchedule;

  @ApiProperty({
    description: 'Duration value (combined with unit)',
    example: 30,
  })
  duration!: number;

  @ApiProperty({
    description: 'Unit for duration (MINUTES, HOURS, or DAYS)',
    enum: UsageDurationUnit,
    enumName: 'UsageDurationUnit',
  })
  unit!: UsageDurationUnit;
  static readonly responseFields: ResponseFields = {
    id: null,
    scheduleId: null,
    schedule: () => ResourceMaintenanceSchedule,
    duration: null,
    unit: null,
  };
}
