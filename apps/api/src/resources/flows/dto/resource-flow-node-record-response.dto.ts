import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { ResourceFlowNodeType } from '@attraccess/application-models';

/** Schema name stays `ResourceFlowNodePosition` so the published API description does not change. */
@ApiSchema({ name: 'ResourceFlowNodePosition' })
export class ResourceFlowNodePositionResponseDto {
  @ApiProperty({ description: 'The x position of the node', example: 100 })
  x!: number;

  @ApiProperty({ description: 'The y position of the node', example: 100 })
  y!: number;
}

/** Schema name stays `ResourceFlowNode` so the published API description does not change. */
@ApiSchema({ name: 'ResourceFlowNode' })
export class ResourceFlowNodeResponseDto {
  @ApiProperty({ description: 'The unique identifier of the resource flow node', example: 'TGVgqDzCKXKVr-XGUD5V3' })
  id!: string;

  @ApiProperty({
    description: 'The type of the node',
    example: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
    enum: ResourceFlowNodeType,
    enumName: 'ResourceFlowNodeType',
  })
  type!: ResourceFlowNodeType;

  @ApiProperty({
    description: 'The position of the node',
    example: { x: 100, y: 100 },
    type: () => ResourceFlowNodePositionResponseDto,
  })
  position!: ResourceFlowNodePositionResponseDto;

  @ApiProperty({
    description: 'The data of the node, depending on the type of the node',
    example: { url: 'https://example.com', method: 'GET' },
    type: Object,
  })
  data!: Record<string, unknown>;

  @ApiProperty({ description: 'When the node was created', type: String, format: 'date-time', required: false })
  createdAt!: Date;

  @ApiProperty({ description: 'When the node was last updated', type: String, format: 'date-time', required: false })
  updatedAt!: Date;

  @ApiProperty({
    description: 'The id of the resource that this node belongs to; null for global-flow nodes',
    example: 1,
    nullable: true,
    type: Number,
  })
  resourceId!: number | null;

  @ApiProperty({
    description: 'The id of the global flow that this node belongs to; null for resource-flow nodes',
    example: 1,
    nullable: true,
    type: Number,
  })
  flowId!: number | null;
}
