import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.dto';
import { User } from './user.dto';
import { ResourceMaintenanceSchedule } from './resource-maintenance-schedule.dto';
import type { ResponseFields } from '../response-mapper';

export class ResourceMaintenance {
  @ApiProperty({
    description: 'The unique identifier of the maintenance',
    example: 1,
  })
  id!: number;

  @ApiProperty({
    description: 'When the maintenance was created',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'When the maintenance was last updated',
  })
  updatedAt!: Date;

  @ApiProperty({
    description: 'The ID of the resource',
    example: 1,
  })
  resourceId!: number;

  resource!: Resource;

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

  @ApiProperty({
    description: 'The reason for the maintenance',
    required: false,
  })
  reason!: string | null;

  @ApiProperty({
    type: Object,
    description: 'The user who created/started the maintenance record',
    required: false,
  })
  createdByUser!: User | null;

  @ApiProperty({
    type: Object,
    description: 'The user who marked the maintenance as done',
    required: false,
  })
  completedByUser!: User | null;

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
  })
  maintenanceSchedule!: ResourceMaintenanceSchedule | null;
  static readonly responseFields: ResponseFields = {
    id: null,
    createdAt: null,
    updatedAt: null,
    resourceId: null,
    resource: () => Resource,
    startTime: null,
    endTime: null,
    reason: null,
    createdByUser: () => User,
    completedByUser: () => User,
    completedAt: null,
    maintenanceSchedule: () => ResourceMaintenanceSchedule,
  };
}
