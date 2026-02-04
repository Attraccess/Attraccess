import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { ResourceFlowNodeDto } from './resource-flow-node.dto';
import { ResourceFlowEdgeDto } from './resource-flow-edge.dto';
import { ValidationError } from '../resource-flows.service';
import { ValidationErrorDto } from './validation-error.dto';

export class SubFlowResponseDto {
  @ApiProperty({
    description: 'The unique identifier of the sub-flow',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'The name of the sub-flow',
    example: 'Notify usage updates',
  })
  name: string;

  @ApiProperty({
    description: 'Optional description of the sub-flow',
    required: false,
    example: 'Reusable flow for sending MQTT updates.',
  })
  description?: string | null;

  @ApiProperty({
    description: 'Input handles available for this sub-flow',
    type: 'string',
    isArray: true,
    example: ['input'],
  })
  inputs: string[];

  @ApiProperty({
    description: 'Output handles available for this sub-flow',
    type: 'string',
    isArray: true,
    example: ['output'],
  })
  outputs: string[];

  @ApiProperty({
    description: 'Array of flow nodes defining the sub-flow steps',
    type: [ResourceFlowNodeDto],
    example: [
      {
        id: 'input-1',
        type: ResourceFlowNodeType.INPUT_SUBFLOW,
        position: { x: 100, y: 200 },
        data: { name: 'input' },
      },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResourceFlowNodeDto)
  nodes: ResourceFlowNodeDto[];

  @ApiProperty({
    description: 'Array of flow edges connecting nodes to define the sub-flow',
    type: [ResourceFlowEdgeDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResourceFlowEdgeDto)
  edges: ResourceFlowEdgeDto[];

  @ApiProperty({
    description: 'Validation errors for nodes, if any',
    type: [ValidationErrorDto],
    required: false,
  })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ValidationErrorDto)
  validationErrors?: ValidationError[];

  @ApiProperty({
    description: 'When the sub-flow was created',
    type: String,
    format: 'date-time',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'When the sub-flow was last updated',
    type: String,
    format: 'date-time',
  })
  updatedAt: Date;
}
