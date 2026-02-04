import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ResourceFlowNodeDto } from './resource-flow-node.dto';
import { ResourceFlowEdgeDto } from './resource-flow-edge.dto';

export class SubFlowSaveDto {
  @ApiProperty({
    description: 'The name of the sub-flow',
    example: 'Notify usage updates',
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Optional description of the sub-flow',
    example: 'Reusable flow for sending MQTT updates.',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiProperty({
    description: 'Array of flow nodes defining the sub-flow steps',
    type: [ResourceFlowNodeDto],
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
}
