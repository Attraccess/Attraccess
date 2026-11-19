import {
  Check,
  Entity,
  Index,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.entity';
import { Flow } from './flow.entity';
import { ResourceFlowNodeType } from '@attraccess/application-models';

export {
  ExternalEffectFailureBehaviorSchema,
  ExternalEffectPolicySchema,
  HttpRequestNodeDataSchema,
  MqttSendMessageNodeDataSchema,
  MqttMessageReceivedNodeDataSchema,
  MqttWaitForMessageNodeDataSchema,
  NodeWithoutDataSchema,
  ButtonNodeDataSchema,
  WaitNodeDataSchema,
  IfNodeDataSchema,
  SetPayloadNodeDataSchema,
  ErrorNodeDataSchema,
  BillingTransactionItemCreateSchema,
  ResourceActivityTrackActivityNodeDataSchema,
  ResourceOperatingTransitionNodeDataSchema,
  InputResourceActivityNoActivityNodeDataSchema,
  ResourceUsageEndSessionNodeDataSchema,
  VariableScopeSchema,
  SetVariablesNodeDataSchema,
  GetVariablesNodeDataSchema,
  VariableChangedNodeDataSchema,
  HealthStateOptionEnum,
  ResourceHealthHeartbeatNodeDataSchema,
  ResourceHealthSetNodeDataSchema,
  CompanionLockNodeDataSchema,
  CompanionIdleActiveNodeDataSchema,
  CompanionForegroundAppNodeDataSchema,
  CompanionUsbDeviceNodeDataSchema,
  MeteringStartNodeDataSchema,
  MeteringCollectNodeDataSchema,
  MeteringReadyNodeDataSchema,
  MeteringReportNodeDataSchema,
  getNodeDataSchema,
  getExternalEffectFailureBehavior,
} from '@attraccess/application-models';
export type { ExternalEffectFailureBehavior } from '@attraccess/application-models';

/** Canvas coordinates are fractional (dragging a node yields values like 76.05): double precision, never integer. */
export class ResourceFlowNodePosition {
  @Column({ type: 'float' })
  @ApiProperty({
    description: 'The x position of the node',
    example: 100,
  })
  x!: number;

  @Column({ type: 'float' })
  @ApiProperty({
    description: 'The y position of the node',
    example: 100,
  })
  y!: number;
}

@Entity()
@Index('IDX_resource_flow_node_type_flow', ['type', 'flowId'])
@Index('IDX_resource_flow_node_flow', ['flowId'])
// Exactly one owner: a resource flow or a global flow.
@Check('CHK_resource_flow_node_owner', '("resourceId" IS NULL) <> ("flowId" IS NULL)')
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

  @Column({ type: 'jsonb', nullable: true })
  @ApiProperty({
    description: 'The data of the node, depending on the type of the node',
    example: {
      url: 'https://example.com',
      method: 'GET',
    },
  })
  data!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  @ApiProperty({
    description: 'When the node was created',
    type: String,
    format: 'date-time',
    required: false,
  })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  @ApiProperty({
    description: 'When the node was last updated',
    type: String,
    format: 'date-time',
    required: false,
  })
  updatedAt!: Date;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({
    description: 'The id of the resource that this node belongs to; null for global-flow nodes',
    example: 1,
    nullable: true,
    type: Number,
  })
  resourceId!: number | null;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({
    description: 'The id of the global flow that this node belongs to; null for resource-flow nodes',
    example: 1,
    nullable: true,
    type: Number,
  })
  flowId!: number | null;

  @ManyToOne(() => Flow, (flow) => flow.nodes, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'flowId', foreignKeyConstraintName: 'FK_resource_flow_node_flow' })
  flow!: Flow | null;

  @ManyToOne(() => Resource, (resource) => resource.flowNodes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resourceId' })
  @ApiProperty({
    description: 'The resource being this node belongs to',
    type: () => Resource,
    required: false,
  })
  resource!: Resource | null;
}
