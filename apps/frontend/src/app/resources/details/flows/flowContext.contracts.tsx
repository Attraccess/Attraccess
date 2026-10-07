import React from 'react';
import { Node } from '@xyflow/react';
import { Edge } from '@xyflow/react';
import { Connection } from '@xyflow/react';
import { OnNodesChange } from '@xyflow/react';
import { OnEdgesChange } from '@xyflow/react';
import { NodeTypes } from '@xyflow/react';
import { ResourceFlowLog } from '@attraccess/react-query-client';
import { ReactNode } from 'react';

export type LiveLogReceiver = (log: ResourceFlowLog) => void;

export interface FlowContextType {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange<Node>;
  onEdgesChange: OnEdgesChange<Edge>;
  onConnect: (params: Edge | Connection) => void;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  addNode: (node: Node) => void;
  removeNode: (nodeId: string) => void;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  resourceId: number;
  resourceType: 'machine' | 'door';
  resourceSeparateUnlockAndUnlatch: boolean;
  resourceAllowTakeOver: boolean;
  liveLogs: ResourceFlowLog[];
  addLiveLogReceiver: (receiver: LiveLogReceiver) => void;
  removeLiveLogReceiver: (receiver: LiveLogReceiver) => void;
  flowNodeTypes: NodeTypes;
  copySelectedNodes: () => Promise<void>;
  cutSelectedNodes: () => Promise<void>;
  pasteNodes: (targetFlowPosition?: { x: number; y: number }) => Promise<void>;
  validationErrors: Record<string, string>;
  setValidationErrors: (errors: Array<{ nodeId: string; message: string }>) => void;
}

export interface FlowProviderProps {
  children: ReactNode;
  resourceId: number;
}
