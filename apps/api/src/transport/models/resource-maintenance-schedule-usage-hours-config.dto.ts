import { ApiProperty } from '@nestjs/swagger';
import { ResourceMaintenanceSchedule } from './resource-maintenance-schedule.dto';
import { UsageDurationUnit } from '@attraccess/application-models';
import type { ResponseFields } from '../response-mapper';

/**
 * Config for USAGE_HOURS trigger. Baseline is always the end of the last maintenance
 * created by this schedule (when that maintenance was marked done).
 */

export class ResourceMaintenanceScheduleUsageHoursConfig {
  @ApiProperty({ description: 'Unique identifier', example: 1 })
  id!: number;

  @ApiProperty({ description: 'Schedule this config belongs to', example: 1 })
  scheduleId!: number;

  schedule!: ResourceMaintenanceSchedule;

  @ApiProperty({
    description: 'Duration value (combined with unit) for usage threshold',
    example: 100,
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
