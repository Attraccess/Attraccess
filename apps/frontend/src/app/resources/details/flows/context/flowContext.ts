// Kept apart from the provider so flow nodes it renders can read the context
// without importing the provider back.
import { createContext, useContext } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Connection, Edge, Node, NodeTypes, OnEdgesChange, OnNodesChange } from '@xyflow/react';
import type { ResourceFlowLog, ResourceFlowNodeSchemaDto } from '@attraccess/react-query-client';
import type { FlowOwner } from '../flowOwner';
import type { NodeValidationError } from '../node/validationMessages';

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
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  owner: FlowOwner;
  /** Only set for resource flows. */
  resourceId: number | undefined;
  resourceType: 'machine' | 'door';
  resourceSeparateUnlockAndUnlatch: boolean;
  resourceAllowTakeOver: boolean;
  addLiveLogReceiver: (receiver: LiveLogReceiver) => void;
  removeLiveLogReceiver: (receiver: LiveLogReceiver) => void;
  flowNodeTypes: NodeTypes;
  /** The owner's node schemas by node type; empty until they load. */
  nodeSchemasByType: ReadonlyMap<string, ResourceFlowNodeSchemaDto>;
  copySelectedNodes: () => Promise<void>;
  cutSelectedNodes: () => Promise<void>;
  pasteNodes: (targetFlowPosition?: { x: number; y: number }) => Promise<void>;
  /** API validation errors by node id. */
  validationErrors: Record<string, NodeValidationError[]>;
  setValidationErrors: (errors: ReadonlyArray<NodeValidationError & { nodeId: string }>) => void;
}

export const FlowContext = createContext<FlowContextType | undefined>(undefined);

export function useFlowContext(): FlowContextType {
  const context = useContext(FlowContext);
  if (context === undefined) {
    throw new Error('useFlowContext must be used within a FlowProvider');
  }
  return context;
}
