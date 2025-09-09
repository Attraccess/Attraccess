import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { ApiProperty } from '@nestjs/swagger';

export class ResourceFlowNodeSchemaDto {
  @ApiProperty({
    description: 'The name of the node type',
    type: 'string',
    enum: ResourceFlowNodeType,
  })
  type: ResourceFlowNodeType;

  @ApiProperty({
    description: 'The schema for a node type',
    type: 'object',
    additionalProperties: true,
  })
  configSchema: Record<string, unknown>;

  @ApiProperty({
    description: 'The inputs for a node type',
    type: 'string',
    isArray: true,
  })
  inputs: string[];

  @ApiProperty({
    description: 'The outputs for a node type',
    type: 'string',
    isArray: true,
  })
  outputs: string[];

  @ApiProperty({
    description: 'Whether the node type is supported by this resource',
    type: 'boolean',
  })
  supportedByResource: boolean;

  @ApiProperty({
    description: 'Whether the node type is an output node',
    type: 'boolean',
  })
  isOutput: boolean;
}
