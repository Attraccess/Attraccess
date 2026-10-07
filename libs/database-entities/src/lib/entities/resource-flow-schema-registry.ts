import { ResourceFlowNodeType } from './resource-flow-node-type';
import {
  ButtonNodeDataSchema,
  NodeWithoutDataSchema,
  InputResourceActivityNoActivityNodeDataSchema,
  BillingTransactionItemCreateSchema,
  WaitNodeDataSchema,
  IfNodeDataSchema,
  ErrorNodeDataSchema,
  ResourceActivityTrackActivityNodeDataSchema,
  ResourceOperatingTransitionNodeDataSchema,
  ResourceHealthHeartbeatNodeDataSchema,
  ResourceHealthSetNodeDataSchema,
} from './resource-flow-resource-schemas';
import {
  MqttMessageReceivedNodeDataSchema,
  HttpRequestNodeDataSchema,
  MqttSendMessageNodeDataSchema,
  MqttWaitForMessageNodeDataSchema,
  ResourceUsageEndSessionNodeDataSchema,
} from './resource-flow-network-schemas';
import {
  SetPayloadNodeDataSchema,
  SetVariablesNodeDataSchema,
  GetVariablesNodeDataSchema,
  VariableChangedNodeDataSchema,
} from './resource-flow-variable-schemas';
import {
  CompanionLockNodeDataSchema,
  CompanionIdleActiveNodeDataSchema,
  CompanionForegroundAppNodeDataSchema,
  CompanionUsbDeviceNodeDataSchema,
} from './resource-flow-companion-schemas';
import {
  MeteringStartNodeDataSchema,
  MeteringCollectNodeDataSchema,
  MeteringReadyNodeDataSchema,
  MeteringReportNodeDataSchema,
} from './resource-flow-metering-schemas';
import { z } from 'zod';

export const nodeDataSchemas = {
  [ResourceFlowNodeType.INPUT_BUTTON]: ButtonNodeDataSchema,
  [ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED]: NodeWithoutDataSchema,
  [ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED]: NodeWithoutDataSchema,
  [ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER]: NodeWithoutDataSchema,
  [ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLOCKED]: NodeWithoutDataSchema,
  [ResourceFlowNodeType.INPUT_RESOURCE_DOOR_LOCKED]: NodeWithoutDataSchema,
  [ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLATCHED]: NodeWithoutDataSchema,
  [ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED]: MqttMessageReceivedNodeDataSchema,
  [ResourceFlowNodeType.INPUT_RESOURCE_ACTIVITY_NO_ACTIVITY]: InputResourceActivityNoActivityNodeDataSchema,
  [ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS]: BillingTransactionItemCreateSchema,
  [ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST]: HttpRequestNodeDataSchema,
  [ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE]: MqttSendMessageNodeDataSchema,
  [ResourceFlowNodeType.PROCESSING_WAIT]: WaitNodeDataSchema,
  [ResourceFlowNodeType.PROCESSING_IF]: IfNodeDataSchema,
  [ResourceFlowNodeType.PROCESSING_SET_PAYLOAD]: SetPayloadNodeDataSchema,
  [ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE]: MqttWaitForMessageNodeDataSchema,
  [ResourceFlowNodeType.PROCESSING_ERROR]: ErrorNodeDataSchema,
  [ResourceFlowNodeType.OUTPUT_RESOURCE_USAGE_END_SESSION]: ResourceUsageEndSessionNodeDataSchema,
  [ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_TRACK_ACTIVITY]: ResourceActivityTrackActivityNodeDataSchema,
  [ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_OPERATING]: ResourceOperatingTransitionNodeDataSchema,
  [ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_IDLE]: ResourceOperatingTransitionNodeDataSchema,
  [ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT]: ResourceHealthHeartbeatNodeDataSchema,
  [ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET]: ResourceHealthSetNodeDataSchema,
  [ResourceFlowNodeType.PROCESSING_SET_VARIABLES]: SetVariablesNodeDataSchema,
  [ResourceFlowNodeType.PROCESSING_GET_VARIABLES]: GetVariablesNodeDataSchema,
  [ResourceFlowNodeType.INPUT_VARIABLE_CHANGED]: VariableChangedNodeDataSchema,
  [ResourceFlowNodeType.OUTPUT_COMPANION_LOCK_PC]: CompanionLockNodeDataSchema,
  [ResourceFlowNodeType.OUTPUT_COMPANION_UNLOCK_PC]: CompanionLockNodeDataSchema,
  [ResourceFlowNodeType.INPUT_COMPANION_IDLE]: CompanionIdleActiveNodeDataSchema,
  [ResourceFlowNodeType.INPUT_COMPANION_ACTIVE]: CompanionIdleActiveNodeDataSchema,
  [ResourceFlowNodeType.INPUT_COMPANION_FOREGROUND_APP_CHANGED]: CompanionForegroundAppNodeDataSchema,
  [ResourceFlowNodeType.INPUT_COMPANION_USB_DEVICE_CONNECTED]: CompanionUsbDeviceNodeDataSchema,
  [ResourceFlowNodeType.INPUT_COMPANION_USB_DEVICE_DISCONNECTED]: CompanionUsbDeviceNodeDataSchema,
  [ResourceFlowNodeType.INPUT_METERING_START]: MeteringStartNodeDataSchema,
  [ResourceFlowNodeType.INPUT_METERING_COLLECT]: MeteringCollectNodeDataSchema,
  [ResourceFlowNodeType.OUTPUT_METERING_READY]: MeteringReadyNodeDataSchema,
  [ResourceFlowNodeType.OUTPUT_METERING_REPORT]: MeteringReportNodeDataSchema,
} satisfies Record<ResourceFlowNodeType, z.ZodType>;

export function getNodeDataSchema(nodeType: ResourceFlowNodeType) {
  if (!Object.hasOwn(nodeDataSchemas, nodeType)) throw new Error(`Unknown node type: ${nodeType}`);
  return nodeDataSchemas[nodeType];
}
