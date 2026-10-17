import { Resource } from './resource';
import { ResourceFlowNodeType } from './resource-flow-node/node-type';

export { ResourceFlowNodeType } from './resource-flow-node/node-type';
export {
  ExternalEffectFailureBehaviorSchema,
  ExternalEffectPolicySchema,
} from './resource-flow-node/external-effect-policy';
export type { ExternalEffectFailureBehavior } from './resource-flow-node/external-effect-policy';
export { HttpRequestNodeDataSchema } from './resource-flow-node/http-schema';
export {
  MqttSendMessageNodeDataSchema,
  MqttMessageReceivedNodeDataSchema,
  MqttWaitForMessageNodeDataSchema,
} from './resource-flow-node/mqtt-schemas';
export {
  NodeWithoutDataSchema,
  ButtonNodeDataSchema,
  WaitNodeDataSchema,
  IfNodeDataSchema,
  SetPayloadNodeDataSchema,
  ErrorNodeDataSchema,
} from './resource-flow-node/processing-schemas';
export {
  BillingTransactionItemCreateSchema,
  ResourceActivityTrackActivityNodeDataSchema,
  ResourceOperatingTransitionNodeDataSchema,
  InputResourceActivityNoActivityNodeDataSchema,
  ResourceUsageEndSessionNodeDataSchema,
} from './resource-flow-node/resource-schemas';
export {
  VariableScopeSchema,
  SetVariablesNodeDataSchema,
  GetVariablesNodeDataSchema,
  VariableChangedNodeDataSchema,
} from './resource-flow-node/variable-schemas';
export {
  HealthStateOptionEnum,
  ResourceHealthHeartbeatNodeDataSchema,
  ResourceHealthSetNodeDataSchema,
} from './resource-flow-node/health-schemas';
export {
  CompanionLockNodeDataSchema,
  CompanionIdleActiveNodeDataSchema,
  CompanionForegroundAppNodeDataSchema,
  CompanionUsbDeviceNodeDataSchema,
} from './resource-flow-node/companion-schemas';
export {
  MeteringStartNodeDataSchema,
  MeteringCollectNodeDataSchema,
  MeteringReadyNodeDataSchema,
  MeteringReportNodeDataSchema,
} from './resource-flow-node/metering-schemas';
export { getNodeDataSchema, getExternalEffectFailureBehavior } from './resource-flow-node/schema-registry';

export interface ResourceFlowNodePosition {
  x: number;
  y: number;
}

export interface ResourceFlowNode {
  id: string;
  type: ResourceFlowNodeType;
  position: ResourceFlowNodePosition;
  data: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  resourceId: number;
  resource: Resource;
}
