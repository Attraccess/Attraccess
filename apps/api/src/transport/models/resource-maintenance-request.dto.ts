import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.dto';
import { User } from './user.dto';
import { ResourceMaintenance } from './resource.maintenance.dto';
import { MaintenanceRequestStatus } from '@attraccess/application-models';
import type { ResponseFields } from '../response-mapper';

export class ResourceMaintenanceRequest {
  @ApiProperty({
    description: 'The unique identifier of the maintenance request',
    example: 1,
  })
  id!: number;

  @ApiProperty({
    description: 'When the request was created',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'When the request was last updated',
  })
  updatedAt!: Date;

  @ApiProperty({
    description: 'The ID of the resource the request is for',
    example: 1,
  })
  resourceId!: number;

  resource!: Resource;

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
  })
  createdByUser!: User | null;

  @ApiProperty({
    description: 'The maintainer who resolved or dismissed the request',
    required: false,
  })
  resolvedByUser!: User | null;

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
  })
  resultingMaintenance!: ResourceMaintenance | null;
  static readonly responseFields: ResponseFields = {
    id: null,
    createdAt: null,
    updatedAt: null,
    resourceId: null,
    resource: () => Resource,
    reason: null,
    status: null,
    createdByUser: () => User,
    resolvedByUser: () => User,
    resolvedAt: null,
    resultingMaintenance: () => ResourceMaintenance,
  };
}

export { MaintenanceRequestStatus } from '@attraccess/application-models';
