import { ComponentType } from 'react';
import { NodeProps } from '@xyflow/react';
import { AttraccessBaseNode } from './base';
import { WaitNode } from './wait';
import { MQTTSendMessageNode } from './mqtt/sendMessage';
import { HTTPRequestNode } from './http/sendRequest';
import { IfNode } from './if';
import { ButtonNode } from './button';
import { useFlowContext } from '../flowContext';

export enum AttraccessNodeType {
  input = 'input',
  output = 'output',
  processing = 'processing',
}

export interface AttraccessNode {
  component: ComponentType<
    NodeProps & {
      data: unknown;
    }
  >;
  type: AttraccessNodeType;
  supportedResourceTypes?: Array<'machine' | 'door'>;
}
function SimpleNodeComponent(
  props: NodeProps & {
    previewMode?: boolean;
    node: {
      key: string;
      type: AttraccessNodeType;
      supportedResourceTypes?: Array<'machine' | 'door'>;
    };
  }
) {
  const { node, previewMode } = props;
  const { resourceType, resourceSeparateUnlockAndUnlatch, resourceAllowTakeOver } = useFlowContext();
  let isSupported = !node.supportedResourceTypes || node.supportedResourceTypes.includes(resourceType);
  if (node.key === 'input.resource.door.unlatched' && resourceType === 'door' && !resourceSeparateUnlockAndUnlatch) {
    isSupported = false;
  }
  if (node.key === 'input.resource.usage.takeover' && resourceType === 'machine' && !resourceAllowTakeOver) {
    isSupported = false;
  }
  return (
    <AttraccessBaseNode
      nodeType={node.key}
      inputs={
        node.type === AttraccessNodeType.output || node.type === AttraccessNodeType.processing ? [{ id: 'input' }] : []
      }
      outputs={
        node.type === AttraccessNodeType.input || node.type === AttraccessNodeType.processing ? [{ id: 'output' }] : []
      }
      previewMode={previewMode}
      unsupported={!isSupported}
    />
  );
}

const supportsAll: Array<'machine' | 'door'> = ['machine', 'door'];

const nodeDefinitions: Array<{
  key: string;
  type: AttraccessNodeType;
  supportedResourceTypes?: Array<'machine' | 'door'>;
}> = [
  // Machine usage events
  {
    key: 'input.resource.usage.started',
    type: AttraccessNodeType.input,
    supportedResourceTypes: ['machine'],
  },
  {
    key: 'input.resource.usage.stopped',
    type: AttraccessNodeType.input,
    supportedResourceTypes: ['machine'],
  },
  {
    key: 'input.resource.usage.takeover',
    type: AttraccessNodeType.input,
    supportedResourceTypes: ['machine'],
  },
  // Door events
  {
    key: 'input.resource.door.locked',
    type: AttraccessNodeType.input,
    supportedResourceTypes: ['door'],
  },
  {
    key: 'input.resource.door.unlocked',
    type: AttraccessNodeType.input,
    supportedResourceTypes: ['door'],
  },
  {
    key: 'input.resource.door.unlatched',
    type: AttraccessNodeType.input,
    supportedResourceTypes: ['door'],
  },
  // Common outputs (also included explicitly below with custom components)
  {
    key: 'output.mqtt.sendMessage',
    type: AttraccessNodeType.output,
    supportedResourceTypes: supportsAll,
  },
];

const simpleNodes = Object.fromEntries(
  nodeDefinitions.map((node) => [
    node.key,
    {
      component: (props: NodeProps & { previewMode?: boolean }) => <SimpleNodeComponent {...props} node={node} />,
      type: node.type,
      supportedResourceTypes: node.supportedResourceTypes,
    },
  ])
);

export const AttraccessNodes: Record<string, AttraccessNode> = {
  ...simpleNodes,
  'processing.wait': {
    component: WaitNode,
    type: AttraccessNodeType.processing,
    supportedResourceTypes: supportsAll,
  },
  'output.mqtt.sendMessage': {
    component: MQTTSendMessageNode,
    type: AttraccessNodeType.output,
    supportedResourceTypes: supportsAll,
  },
  'output.http.sendRequest': {
    component: HTTPRequestNode,
    type: AttraccessNodeType.output,
    supportedResourceTypes: supportsAll,
  },
  'processing.if': {
    component: IfNode,
    type: AttraccessNodeType.processing,
    supportedResourceTypes: supportsAll,
  },
  'input.button': {
    component: ButtonNode,
    type: AttraccessNodeType.input,
    supportedResourceTypes: ['machine'],
  },
};
