import { getNodeDataSchema, ResourceFlowNodeType, ResourceType } from '@attraccess/database-entities';
import { z } from 'zod';
import { ResourceFlowNodeSchemaDto } from './dto/resource-flow-node-schemas-response.dto';

interface NodePresentation {
  inputs?: string[];
  outputs?: string[];
  isOutput?: boolean;
  isInput?: boolean;
  resourceType?: ResourceType;
}

const presentations: Record<ResourceFlowNodeType, NodePresentation> = {
  [ResourceFlowNodeType.INPUT_BUTTON]: { outputs: ['output'], resourceType: ResourceType.Machine },
  [ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED]: { outputs: ['output'], resourceType: ResourceType.Machine },
  [ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED]: { outputs: ['output'], resourceType: ResourceType.Machine },
  [ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER]: { outputs: ['output'], resourceType: ResourceType.Machine },
  [ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLOCKED]: { outputs: ['output'], resourceType: ResourceType.Door },
  [ResourceFlowNodeType.INPUT_RESOURCE_DOOR_LOCKED]: { outputs: ['output'], resourceType: ResourceType.Door },
  [ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLATCHED]: { outputs: ['output'], resourceType: ResourceType.Door },
  [ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED]: { outputs: ['output'] },
  [ResourceFlowNodeType.INPUT_RESOURCE_ACTIVITY_NO_ACTIVITY]: {
    outputs: ['output'],
    resourceType: ResourceType.Machine,
  },
  [ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS]: {
    inputs: ['input'],
    resourceType: ResourceType.Machine,
  },
  [ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST]: {
    inputs: ['input'],
    outputs: ['output', 'failure'],
    isOutput: true,
  },
  [ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE]: {
    inputs: ['input'],
    outputs: ['output', 'failure'],
    isOutput: true,
  },
  [ResourceFlowNodeType.OUTPUT_RESOURCE_USAGE_END_SESSION]: {
    inputs: ['input'],
    outputs: ['output', 'failure'],
    isOutput: true,
    resourceType: ResourceType.Machine,
  },
  [ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_TRACK_ACTIVITY]: {
    inputs: ['input'],
    isOutput: true,
    resourceType: ResourceType.Machine,
  },
  [ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_OPERATING]: {
    inputs: ['input'],
    outputs: ['output'],
    isOutput: true,
    resourceType: ResourceType.Machine,
  },
  [ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_IDLE]: {
    inputs: ['input'],
    outputs: ['output'],
    isOutput: true,
    resourceType: ResourceType.Machine,
  },
  [ResourceFlowNodeType.PROCESSING_WAIT]: { inputs: ['input'], outputs: ['output'] },
  [ResourceFlowNodeType.PROCESSING_IF]: { inputs: ['input'], outputs: ['output-true', 'output-false'] },
  [ResourceFlowNodeType.PROCESSING_SET_PAYLOAD]: { inputs: ['input'], outputs: ['output'] },
  [ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE]: { inputs: ['input'], outputs: ['output', 'failure'] },
  [ResourceFlowNodeType.PROCESSING_ERROR]: { inputs: ['input'] },
  [ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT]: { inputs: ['input'], outputs: ['output'], isOutput: true },
  [ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET]: { inputs: ['input'], outputs: ['output'], isOutput: true },
  [ResourceFlowNodeType.INPUT_VARIABLE_CHANGED]: { outputs: ['output'] },
  [ResourceFlowNodeType.PROCESSING_SET_VARIABLES]: { inputs: ['input'], outputs: ['output'] },
  [ResourceFlowNodeType.PROCESSING_GET_VARIABLES]: { inputs: ['input'], outputs: ['output'] },
  [ResourceFlowNodeType.OUTPUT_COMPANION_LOCK_PC]: { inputs: ['input'], outputs: ['output'], isOutput: true },
  [ResourceFlowNodeType.OUTPUT_COMPANION_UNLOCK_PC]: { inputs: ['input'], outputs: ['output'], isOutput: true },
  [ResourceFlowNodeType.INPUT_COMPANION_IDLE]: { inputs: [], outputs: ['output'] },
  [ResourceFlowNodeType.INPUT_COMPANION_ACTIVE]: { inputs: [], outputs: ['output'] },
  [ResourceFlowNodeType.INPUT_COMPANION_FOREGROUND_APP_CHANGED]: { inputs: [], outputs: ['output'] },
  [ResourceFlowNodeType.INPUT_COMPANION_USB_DEVICE_CONNECTED]: { inputs: [], outputs: ['output'] },
  [ResourceFlowNodeType.INPUT_COMPANION_USB_DEVICE_DISCONNECTED]: { inputs: [], outputs: ['output'] },
};

export function getCoreNodeSchemas(resourceType: ResourceType): ResourceFlowNodeSchemaDto[] {
  return Object.values(ResourceFlowNodeType).map((type) => {
    const presentation = presentations[type];
    return {
      type,
      configSchema: z.toJSONSchema(getNodeDataSchema(type), { io: 'input' }),
      inputs: [...(presentation.inputs ?? [])],
      outputs: [...(presentation.outputs ?? [])],
      supportedByResource: presentation.resourceType === undefined || presentation.resourceType === resourceType,
      isOutput: presentation.isOutput ?? false,
      isInput: presentation.isInput ?? false,
    };
  });
}
