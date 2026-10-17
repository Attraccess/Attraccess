import { ApiProperty } from '@nestjs/swagger';
import { ResourceMaintenanceSchedule } from './resource-maintenance-schedule.dto';
import type { ResponseFields } from '../response-mapper';

/**
 * Config for USAGE_COUNT trigger. Baseline is always the end of the last maintenance
 * created by this schedule (when that maintenance was marked done).
 */

export class ResourceMaintenanceScheduleUsageCountConfig {
  @ApiProperty({ description: 'Unique identifier', example: 1 })
  id!: number;

  @ApiProperty({ description: 'Schedule this config belongs to', example: 1 })
  scheduleId!: number;

  schedule!: ResourceMaintenanceSchedule;

  @ApiProperty({
    description: 'Trigger after this many usage sessions (since last maintenance done for this schedule)',
    example: 50,
  })
  thresholdSessions!: number;
  static readonly responseFields: ResponseFields = {
    id: null,
    scheduleId: null,
    schedule: () => ResourceMaintenanceSchedule,
    thresholdSessions: null,
  };
}
