import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.dto';
import { ResourceFlowNodeType } from '@attraccess/application-models';
import type { ResponseFields } from '../response-mapper';

export { ResourceFlowNodeType } from '@attraccess/application-models';
export { ExternalEffectFailureBehaviorSchema, ExternalEffectPolicySchema } from '@attraccess/application-models';
export type { ExternalEffectFailureBehavior } from '@attraccess/application-models';
export { HttpRequestNodeDataSchema } from '@attraccess/application-models';
export {
  MqttSendMessageNodeDataSchema,
  MqttMessageReceivedNodeDataSchema,
  MqttWaitForMessageNodeDataSchema,
} from '@attraccess/application-models';
export {
  NodeWithoutDataSchema,
  ButtonNodeDataSchema,
  WaitNodeDataSchema,
  IfNodeDataSchema,
  SetPayloadNodeDataSchema,
  ErrorNodeDataSchema,
} from '@attraccess/application-models';
export {
  BillingTransactionItemCreateSchema,
  ResourceActivityTrackActivityNodeDataSchema,
  ResourceOperatingTransitionNodeDataSchema,
  InputResourceActivityNoActivityNodeDataSchema,
  ResourceUsageEndSessionNodeDataSchema,
} from '@attraccess/application-models';
export {
  VariableScopeSchema,
  SetVariablesNodeDataSchema,
  GetVariablesNodeDataSchema,
  VariableChangedNodeDataSchema,
} from '@attraccess/application-models';
export {
  HealthStateOptionEnum,
  ResourceHealthHeartbeatNodeDataSchema,
  ResourceHealthSetNodeDataSchema,
} from '@attraccess/application-models';
export {
  CompanionLockNodeDataSchema,
  CompanionIdleActiveNodeDataSchema,
  CompanionForegroundAppNodeDataSchema,
  CompanionUsbDeviceNodeDataSchema,
} from '@attraccess/application-models';
export {
  MeteringStartNodeDataSchema,
  MeteringCollectNodeDataSchema,
  MeteringReadyNodeDataSchema,
  MeteringReportNodeDataSchema,
} from '@attraccess/application-models';
export { getNodeDataSchema, getExternalEffectFailureBehavior } from '@attraccess/application-models';

export class ResourceFlowNodePosition {
  @ApiProperty({
    description: 'The x position of the node',
    example: 100,
  })
  x!: number;

  @ApiProperty({
    description: 'The y position of the node',
    example: 100,
  })
  y!: number;
  static readonly responseFields: ResponseFields = { x: null, y: null };
}

export class ResourceFlowNode {
  @ApiProperty({
    description: 'The unique identifier of the resource flow node',
    example: 'TGVgqDzCKXKVr-XGUD5V3',
  })
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
  })
  position!: ResourceFlowNodePosition;

  @ApiProperty({
    description: 'The data of the node, depending on the type of the node',
    example: {
      url: 'https://example.com',
      method: 'GET',
    },
  })
  data!: Record<string, unknown>;

  @ApiProperty({
    description: 'When the node was created',
    type: String,
    format: 'date-time',
    required: false,
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'When the node was last updated',
    type: String,
    format: 'date-time',
    required: false,
  })
  updatedAt!: Date;

  @ApiProperty({
    description: 'The id of the resource that this node belongs to',
    example: 1,
  })
  resourceId!: number;

  @ApiProperty({
    description: 'The resource being this node belongs to',
    type: () => Resource,
    required: false,
  })
  resource!: Resource;
  static readonly responseFields: ResponseFields = {
    id: null,
    type: null,
    position: () => ResourceFlowNodePosition,
    data: null,
    createdAt: null,
    updatedAt: null,
    resourceId: null,
    resource: () => Resource,
  };
}
