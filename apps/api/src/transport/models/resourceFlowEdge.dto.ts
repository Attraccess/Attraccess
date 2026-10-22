import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.dto';
import type { ResponseFields } from '../response-mapper';

export class ResourceFlowEdge {
  @ApiProperty({
    description: 'The unique identifier of the resource flow edge',
    example: 'TGVgqDzCKXKVr-XGUD5V3',
  })
  id!: string;

  @ApiProperty({
    description: 'The source node id',
    example: 'TGVgqDzCKXKVr-XGUD5V3',
  })
  source!: string;

  @ApiProperty({
    description: 'The source handle id',
    example: 'TGVgqDzCKXKVr-XGUD5V3',
  })
  sourceHandle!: string | null;

  @ApiProperty({
    description: 'The target node id',
    example: 'TGVgqDzCKXKVr-XGUD5V3',
  })
  target!: string;

  @ApiProperty({
    description: 'The target handle id',
    example: 'TGVgqDzCKXKVr-XGUD5V3',
  })
  targetHandle!: string | null;

  @ApiProperty({
    description: 'When the node was created',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'When the node was last updated',
  })
  updatedAt!: Date;

  @ApiProperty({
    description: 'The id of the resource that this node belongs to',
    example: 1,
  })
  resourceId!: number;

  @ApiProperty({
    description: 'The resource being this edge belongs to',
    type: () => Resource,
    required: false,
  })
  resource!: Resource;
  static readonly responseFields: ResponseFields = {
    id: null,
    source: null,
    sourceHandle: null,
    target: null,
    targetHandle: null,
    createdAt: null,
    updatedAt: null,
    resourceId: null,
    resource: () => Resource,
  };
}
