import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { ResourceFlowNodeDto } from './resource-flow-node.dto';
import { ResourceFlowEdgeDto } from './resource-flow-edge.dto';

export class ResourceFlowSaveDto {
  @ApiProperty({
    description: 'Array of flow nodes defining the workflow steps',
    type: [ResourceFlowNodeDto],
    example: [
      {
        id: 'TGVgqDzCKXKVr-XGUD5V3',
        type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
        position: { x: 100, y: 200 },
        data: {},
      },
      {
        id: 'TGVgqDzCKXKVr-XGUD5V4',
        type: ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST,
        position: { x: 300, y: 200 },
        data: {
          url: 'https://example.com/webhook',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{"message": "Resource usage started"}',
        },
      },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResourceFlowNodeDto)
  nodes: ResourceFlowNodeDto[];

  @ApiProperty({
    description: 'Array of flow edges connecting nodes to define the workflow flow',
    type: [ResourceFlowEdgeDto],
    example: [
      {
        id: 'edge-abc123',
        source: 'TGVgqDzCKXKVr-XGUD5V3',
        target: 'TGVgqDzCKXKVr-XGUD5V4',
      },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResourceFlowEdgeDto)
  edges: ResourceFlowEdgeDto[];
}
