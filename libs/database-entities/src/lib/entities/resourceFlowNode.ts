import { Column, Entity, PrimaryColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { ResourceFlowNodeType } from './resource-flow-node-type';
import { Resource } from './resource.entity';

export class ResourceFlowNodePosition {
  @Column({ type: 'integer' })
  @ApiProperty({
    description: 'The x position of the node',
    example: 100,
  })
  x!: number;

  @Column({ type: 'integer' })
  @ApiProperty({
    description: 'The y position of the node',
    example: 100,
  })
  y!: number;
}

@Entity()
export class ResourceFlowNode {
  @PrimaryColumn({ type: 'text' })
  @ApiProperty({
    description: 'The unique identifier of the resource flow node',
    example: 'TGVgqDzCKXKVr-XGUD5V3',
  })
  id!: string;

  @Column({
    type: 'varchar',
  })
  @ApiProperty({
    description: 'The type of the node',
    example: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
    enum: ResourceFlowNodeType,
    enumName: 'ResourceFlowNodeType',
  })
  type!: ResourceFlowNodeType;

  @Column(() => ResourceFlowNodePosition)
  @ApiProperty({
    description: 'The position of the node',
    example: { x: 100, y: 100 },
  })
  position!: ResourceFlowNodePosition;

  @Column({ type: 'json', nullable: true })
  @ApiProperty({
    description: 'The data of the node, depending on the type of the node',
    example: {
      url: 'https://example.com',
      method: 'GET',
    },
  })
  data!: Record<string, unknown>;

  @CreateDateColumn()
  @ApiProperty({
    description: 'When the node was created',
    type: String,
    format: 'date-time',
    required: false,
  })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({
    description: 'When the node was last updated',
    type: String,
    format: 'date-time',
    required: false,
  })
  updatedAt!: Date;

  @Column({ type: 'integer' })
  @ApiProperty({
    description: 'The id of the resource that this node belongs to',
    example: 1,
  })
  resourceId!: number;

  @ManyToOne(() => Resource, (resource) => resource.flowNodes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resourceId' })
  @ApiProperty({
    description: 'The resource being this node belongs to',
    type: () => Resource,
    required: false,
  })
  resource!: Resource;
}

export { ResourceFlowNodeType } from './resource-flow-node-type';
export {
  ExternalEffectFailureBehaviorSchema,
  ExternalEffectPolicySchema,
  ExternalEffectFailureBehavior,
} from './resource-flow-external-effect';
export {
  HttpRequestNodeDataSchema,
  MqttSendMessageNodeDataSchema,
  MqttMessageReceivedNodeDataSchema,
  MqttWaitForMessageNodeDataSchema,
  ResourceUsageEndSessionNodeDataSchema,
  getExternalEffectFailureBehavior,
} from './resource-flow-network-schemas';
export {
  VariableScopeSchema,
  SetVariablesNodeDataSchema,
  GetVariablesNodeDataSchema,
  VariableChangedNodeDataSchema,
  SetPayloadNodeDataSchema,
} from './resource-flow-variable-schemas';
export {
  NodeWithoutDataSchema,
  ButtonNodeDataSchema,
  WaitNodeDataSchema,
  IfNodeDataSchema,
  BillingTransactionItemCreateSchema,
  ResourceActivityTrackActivityNodeDataSchema,
  ResourceOperatingTransitionNodeDataSchema,
  InputResourceActivityNoActivityNodeDataSchema,
  ErrorNodeDataSchema,
  HealthStateOptionEnum,
  ResourceHealthHeartbeatNodeDataSchema,
  ResourceHealthSetNodeDataSchema,
} from './resource-flow-resource-schemas';
export {
  CompanionLockNodeDataSchema,
  CompanionIdleActiveNodeDataSchema,
  CompanionForegroundAppNodeDataSchema,
  CompanionUsbDeviceNodeDataSchema,
} from './resource-flow-companion-schemas';
export {
  MeteringStartNodeDataSchema,
  MeteringCollectNodeDataSchema,
  MeteringReadyNodeDataSchema,
  MeteringReportNodeDataSchema,
} from './resource-flow-metering-schemas';
export { getNodeDataSchema } from './resource-flow-schema-registry';
