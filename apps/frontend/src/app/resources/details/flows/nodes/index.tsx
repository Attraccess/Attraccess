import { ComponentType } from 'react';
import { NodeProps } from '@xyflow/react';
import { AttraccessBaseNode } from './base';
import { WaitNode } from './wait';
import { MQTTSendMessageNode } from './mqtt/sendMessage';
import { HTTPRequestNode } from './http/sendRequest';
import { IfNode } from './if';
import { ButtonNode } from './button';

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
}

const nodeDefinitions = [
  {
    key: 'input.resource.usage.started',
    type: AttraccessNodeType.input,
  },
  {
    key: 'input.resource.usage.stopped',
    type: AttraccessNodeType.input,
  },
  {
    key: 'input.resource.usage.takeover',
    type: AttraccessNodeType.input,
  },
  {
    key: 'output.mqtt.sendMessage',
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
          inputs={
            node.type === AttraccessNodeType.output || node.type === AttraccessNodeType.processing
              ? [{ id: 'input' }]
              : []
          }
          outputs={
            node.type === AttraccessNodeType.input || node.type === AttraccessNodeType.processing
              ? [{ id: 'output' }]
              : []
          }
          previewMode={previewMode}
        />
      ),
      type: node.type,
    },
  ])
);

export const AttraccessNodes: Record<string, AttraccessNode> = {
  ...simpleNodes,
  'processing.wait': {
    component: WaitNode,
    type: AttraccessNodeType.processing,
  },
  'output.mqtt.sendMessage': {
    component: MQTTSendMessageNode,
    type: AttraccessNodeType.output,
  },
  'output.http.sendRequest': {
    component: HTTPRequestNode,
    type: AttraccessNodeType.output,
  },
  'processing.if': {
    component: IfNode,
    type: AttraccessNodeType.processing,
  },
  'input.button': {
    component: ButtonNode,
    type: AttraccessNodeType.input,
  },
};
