import { operationToken } from '../../../database/transaction-scope';
import type {
  Resource,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceFlowVariable,
  ResourceFlowVariableScope,
} from '@attraccess/application-models';
export type StoredFlowVariable = Pick<ResourceFlowVariable, 'scope' | 'resourceId' | 'key' | 'value' | 'valueType'> &
  Partial<Pick<ResourceFlowVariable, 'id' | 'updatedAt'>>;
export abstract class FlowVariablePersistence {
  abstract findValue(
    scope: ResourceFlowVariableScope,
    resourceId: number | null,
    key: string,
  ): Promise<ResourceFlowVariable | null>;
  abstract findValues(
    scope: ResourceFlowVariableScope,
    resourceId: number | null,
    keys: readonly string[],
  ): Promise<ResourceFlowVariable[]>;
  abstract visibleValues(resourceId: number | null, ordered: boolean): Promise<ResourceFlowVariable[]>;
  abstract storeValue(row: StoredFlowVariable): Promise<ResourceFlowVariable>;
  abstract removeValue(scope: ResourceFlowVariableScope, resourceId: number | null, key: string): Promise<void>;
}

export abstract class FlowTriggerPersistence {
  abstract variableTriggers(resourceId?: number): Promise<ResourceFlowNode[]>;
}

export abstract class ResourceFlowPersistence {
  abstract findResource(id: number): Promise<Resource | null>;
  abstract graphNodes(resourceId: number): Promise<ResourceFlowNode[]>;
  abstract graphEdges(resourceId: number): Promise<ResourceFlowEdge[]>;
  abstract nodesByType(resourceIds: readonly number[], type: ResourceFlowNodeType): Promise<ResourceFlowNode[]>;
  abstract meterIds(resourceId: number): Promise<number[]>;
}
export type FlowNodeDraft = Pick<ResourceFlowNode, 'id' | 'type' | 'position' | 'data'>;
export type FlowEdgeDraft = Pick<ResourceFlowEdge, 'id' | 'source' | 'sourceHandle' | 'target' | 'targetHandle'>;
export interface FlowWriteOperations {
  nodesByType(resourceId: number, type: ResourceFlowNodeType): Promise<ResourceFlowNode[]>;
  replaceGraph(
    resource: Resource,
    nodes: readonly FlowNodeDraft[],
    edges: readonly FlowEdgeDraft[],
  ): Promise<{ nodes: ResourceFlowNode[]; edges: ResourceFlowEdge[] }>;
}
export const FLOW_WRITES = operationToken<FlowWriteOperations>('resource-flow-writes', ['nodesByType', 'replaceGraph']);

export abstract class FlowEventPersistence {
  abstract nodesByType(type: ResourceFlowNodeType): Promise<ResourceFlowNode[]>;
  abstract pageNodesByType(
    type: ResourceFlowNodeType,
    afterId: string | undefined,
    limit: number,
  ): Promise<ResourceFlowNode[]>;
  abstract activeInactivityNodes(): Promise<ResourceFlowNode[]>;
}

export abstract class FlowExecutionPersistence {
  abstract resource(id: number): Promise<Resource | null>;
  abstract button(resourceId: number, buttonId: string): Promise<ResourceFlowNode | null>;
  abstract triggers(resourceId: number, type: ResourceFlowNodeType): Promise<ResourceFlowNode[]>;
  abstract outgoingEdges(nodeId: string, handle: string | undefined): Promise<ResourceFlowEdge[]>;
  abstract node(id: string): Promise<ResourceFlowNode | null>;
}
export const FLOW_EXECUTION_READS = operationToken<FlowExecutionPersistence>('flow execution reads', [
  'resource',
  'button',
  'triggers',
  'outgoingEdges',
  'node',
]);
