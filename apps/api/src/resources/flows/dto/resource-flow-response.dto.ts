import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { ResourceFlowNodeDto } from './resource-flow-node.dto';
import { ResourceFlowEdgeDto } from './resource-flow-edge.dto';
import { ValidationErrorDto } from './validation-error.dto';
import { ValidationError } from '../resource-flows.service';

export class ResourceFlowResponseDto {
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

  @ApiProperty({
    description: 'Validation errors for nodes, if any',
    type: [ValidationErrorDto],
    required: false,
    example: [
      {
        nodeId: 'TGVgqDzCKXKVr-XGUD5V4',
        nodeType: 'action.http.sendRequest',
        field: 'url',
        message: 'Invalid URL format',
        value: 'not-a-valid-url',
      },
    ],
  })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ValidationErrorDto)
  validationErrors?: ValidationError[];
}
