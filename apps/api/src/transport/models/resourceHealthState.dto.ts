import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.dto';
import { ResourceHealthStatus, ResourceHealthSource } from '@attraccess/application-models';
import type { ResponseFields } from '../response-mapper';

export class ResourceHealthState {
  @ApiProperty({
    description: 'The unique identifier of the health state record',
    example: 1,
  })
  id!: number;

  @ApiProperty({
    description: 'The ID of the resource this health state belongs to',
    example: 1,
  })
  resourceId!: number;

  @ApiProperty({
    description: 'The resource this health state belongs to',
    type: () => Resource,
    required: false,
  })
  resource!: Resource;

  @ApiProperty({
    description:
      'Identifier for the source reporting health (e.g. "ir-bridge", "internal-temp"). Empty string for the resource default.',
    example: 'ir-bridge',
  })
  identifier!: string;

  @ApiProperty({
    description: 'Current health status',
    enum: ResourceHealthStatus,
    enumName: 'ResourceHealthStatus',
    example: ResourceHealthStatus.HEALTHY,
  })
  status!: ResourceHealthStatus;

  @ApiProperty({
    description: 'Human-readable reason for the current status (e.g. "not connected"). Null when healthy.',
    required: false,
    nullable: true,
    example: 'not connected',
  })
  reason!: string | null;

  @ApiProperty({
    description: 'Detection variant that produced the current state',
    enum: ResourceHealthSource,
    enumName: 'ResourceHealthSource',
    example: ResourceHealthSource.PAYLOAD,
  })
  source!: ResourceHealthSource;

  @ApiProperty({
    description: 'When the health state was last reported (or when the heartbeat last fired)',
    type: String,
    format: 'date-time',
  })
  lastReportedAt!: Date;

  @ApiProperty({
    description: 'When the health state record was created',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'When the health state record was last updated',
  })
  updatedAt!: Date;
  static readonly responseFields: ResponseFields = {
    id: null,
    resourceId: null,
    resource: () => Resource,
    identifier: null,
    status: null,
    reason: null,
    source: null,
    lastReportedAt: null,
    createdAt: null,
    updatedAt: null,
  };
}

export { ResourceHealthStatus, ResourceHealthSource } from '@attraccess/application-models';
