import { ResourceFlowNodeType } from './node-type';
import { ResourceFlowVariableScope } from './resourceFlowVariable';
import { ResourceType } from './resource-type';

/** Which kind of flow an owner is: bound to one resource, or reacting to events of every resource. */
export type FlowScope = 'resource' | 'global';

export type ResourceFlowVariableValueType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';

/** A named flow that is not tied to one resource. */
export interface FlowRecord {
  id: number;
  name: string;
  description: string | null;
  enabled: boolean;
  scope: FlowScope;
  createdAt: Date;
  updatedAt: Date;
}

export interface FlowNodePosition {
  x: number;
  y: number;
}

/** A node of a resource flow (`resourceId` set) or of a global flow (`flowId` set). */
export interface FlowNodeRecord {
  id: string;
  type: ResourceFlowNodeType;
  position: FlowNodePosition;
  data: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  resourceId: number | null;
  flowId: number | null;
}

export interface FlowEdgeRecord {
  id: string;
  source: string;
  sourceHandle: string | null;
  target: string;
  targetHandle: string | null;
  createdAt: Date;
  updatedAt: Date;
  resourceId: number | null;
  flowId: number | null;
}

/** The canvas an owner saves: what the editor sends, without timestamps. */
export interface FlowCanvasInput {
  nodes: Array<{ id: string; type: string; position: FlowNodePosition; data?: Record<string, unknown> | null }>;
  edges: Array<{
    id: string;
    source: string;
    sourceHandle: string | null;
    target: string;
    targetHandle: string | null;
  }>;
}

export interface FlowVariableRecord {
  id: number;
  scope: ResourceFlowVariableScope;
  resourceId: number | null;
  key: string;
  /** JSON-stringified value. */
  value: string;
  valueType: ResourceFlowVariableValueType;
  createdAt: Date;
  updatedAt: Date;
}

/** What a flow run knows about the resource it acts on. */
export interface FlowResourceRecord {
  id: number;
  name: string;
  type: ResourceType;
  metadata: Record<string, unknown> | null;
}
