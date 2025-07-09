import { ComponentType } from 'react';
import { NodeProps } from '@xyflow/react';
import { AttraccessBaseNode } from './base';
import { WaitNode } from './wait';
import { MQTTSendMessageNode } from './mqtt/sendMessage';
import { HTTPRequestNode } from './http/sendRequest';

export enum AttraccessNodeType {
  input = 'input',
  output = 'output',
  inputOutput = 'input-output',
}

export interface AttraccessNode {
  component: ComponentType<
    NodeProps & {
      data: unknown;
    }
  >;
  type: AttraccessNodeType;
}

const nodeDefinitions = [
  {
    key: 'event.resource.usage.started',
    type: AttraccessNodeType.input,
  },
  {
    key: 'event.resource.usage.stopped',
    type: AttraccessNodeType.input,
  },
  {
    key: 'event.resource.usage.takeover',
    type: AttraccessNodeType.input,
  },
  {
    key: 'action.mqtt.sendMessage',
    type: AttraccessNodeType.output,
  },
];

const simpleNodes = Object.fromEntries(
  nodeDefinitions.map((node) => [
    node.key,
    {
      component: ({ previewMode, resourceId }: { previewMode: boolean; resourceId: number }) => (
        <AttraccessBaseNode
          nodeType={node.key}
          hasSource={node.type === AttraccessNodeType.input || node.type === AttraccessNodeType.inputOutput}
          hasTarget={node.type === AttraccessNodeType.output || node.type === AttraccessNodeType.inputOutput}
          previewMode={previewMode}
        />
      ),
      type: node.type,
    },
  ])
);

export const AttraccessNodes: Record<string, AttraccessNode> = {
  ...simpleNodes,
  'action.util.wait': {
    component: WaitNode,
    type: AttraccessNodeType.inputOutput,
  },
  'action.mqtt.sendMessage': {
    component: MQTTSendMessageNode,
    type: AttraccessNodeType.output,
  },
  'action.http.sendRequest': {
    component: HTTPRequestNode,
    type: AttraccessNodeType.output,
  },
};
