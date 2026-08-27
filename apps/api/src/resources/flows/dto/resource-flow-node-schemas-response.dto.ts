import { ApiProperty } from '@nestjs/swagger';

export class ResourceFlowNodeSchemaDto {
  @ApiProperty({
    description: 'The node type identifier. Core types match the ResourceFlowNodeType enum; plugin types use "plugin.<pluginName>.<nodeName>".',
    type: 'string',
    example: 'output.mqtt.sendMessage',
  })
  type: string;

  @ApiProperty({
    description: 'Human-readable label for the node. Used by the frontend as a display name fallback when no i18n translation exists for the type.',
    type: 'string',
    required: false,
  })
  label?: string;

  @ApiProperty({
    description: 'Optional description of what the node does. Used in the catalog preview fallback.',
    type: 'string',
    required: false,
  })
  description?: string;

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

  @ApiProperty({
    description: 'Whether the node starts a flow run',
    type: 'boolean',
  })
  isInput: boolean;
}
