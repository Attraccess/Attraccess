import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { ResourceFlowNodePositionDto } from './resource-flow-node-position.dto';

export class ResourceFlowNodeDto {
  @ApiProperty({
    description: 'The unique identifier of the resource flow node',
    example: 'TGVgqDzCKXKVr-XGUD5V3',
    type: 'string',
  })
  @IsString()
  id: string;

  @ApiProperty({
    description: 'The type of the node',
    example: ResourceFlowNodeType.EVENT_RESOURCE_USAGE_STARTED,
    enum: ResourceFlowNodeType,
  })
  @IsEnum(ResourceFlowNodeType)
  type: ResourceFlowNodeType;

  @ApiProperty({
    description: 'The position of the node',
    example: { x: 100, y: 200 },
    type: ResourceFlowNodePositionDto,
  })
  @ValidateNested()
  @Type(() => ResourceFlowNodePositionDto)
  position: ResourceFlowNodePositionDto;

  @ApiProperty({
    description: 'The data of the node, depending on the type of the node',
    example: {
      url: 'https://example.com/webhook',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"message": "Resource usage started"}',
    },
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  data: Record<string, unknown>;
}
