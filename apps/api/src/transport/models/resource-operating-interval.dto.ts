import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.dto';
import type { ResponseFields } from '../response-mapper';

export class ResourceOperatingInterval {
  @ApiProperty({ description: 'The unique identifier of the operating interval', example: 1 })
  id!: number;

  @ApiProperty({ description: 'The resource being operated', example: 1 })
  resourceId!: number;

  @ApiProperty({ description: 'UTC instant at which operation began', format: 'date-time' })
  startTime!: Date;

  @ApiProperty({ description: 'UTC instant at which operation ended', format: 'date-time', nullable: true })
  endTime!: Date | null;

  // Snapshot IDs deliberately have no foreign keys: deleting a flow must preserve its timeline provenance.

  @ApiProperty({ description: 'Flow node that opened this interval, if recorded', nullable: true })
  startFlowNodeId!: string | null;

  @ApiProperty({ description: 'Flow execution that opened this interval, if recorded', nullable: true })
  startFlowRunId!: string | null;

  @ApiProperty({ description: 'Flow node that closed this interval, if recorded', nullable: true })
  endFlowNodeId!: string | null;

  @ApiProperty({ description: 'Flow execution that closed this interval, if recorded', nullable: true })
  endFlowRunId!: string | null;

  createdAt!: Date;

  resource!: Resource;
  static readonly responseFields: ResponseFields = {
    id: null,
    resourceId: null,
    startTime: null,
    endTime: null,
    startFlowNodeId: null,
    startFlowRunId: null,
    endFlowNodeId: null,
    endFlowRunId: null,
    createdAt: null,
    resource: () => Resource,
  };
}
