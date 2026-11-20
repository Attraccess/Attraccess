import {
  Flow,
  Resource,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceFlowVariable,
} from '@attraccess/database-entities';
import type {
  FlowEdgeRecord,
  FlowNodeRecord,
  FlowRecord,
  FlowResourceRecord,
  FlowVariableRecord,
} from '@attraccess/application-models';

export const toNodeRecord = (node: ResourceFlowNode): FlowNodeRecord => ({
  id: node.id,
  type: node.type,
  position: { x: node.position.x, y: node.position.y },
  data: node.data,
  createdAt: node.createdAt,
  updatedAt: node.updatedAt,
  resourceId: node.resourceId,
  flowId: node.flowId,
});

export const toEdgeRecord = (edge: ResourceFlowEdge): FlowEdgeRecord => ({
  id: edge.id,
  source: edge.source,
  sourceHandle: edge.sourceHandle,
  target: edge.target,
  targetHandle: edge.targetHandle,
  createdAt: edge.createdAt,
  updatedAt: edge.updatedAt,
  resourceId: edge.resourceId,
  flowId: edge.flowId,
});

export const toFlowRecord = (flow: Flow): FlowRecord => ({
  id: flow.id,
  name: flow.name,
  description: flow.description,
  enabled: flow.enabled,
  scope: flow.scope,
  createdAt: flow.createdAt,
  updatedAt: flow.updatedAt,
});

export const toVariableRecord = (variable: ResourceFlowVariable): FlowVariableRecord => ({
  id: variable.id,
  scope: variable.scope,
  resourceId: variable.resourceId,
  key: variable.key,
  value: variable.value,
  valueType: variable.valueType,
  createdAt: variable.createdAt,
  updatedAt: variable.updatedAt,
});

export const toFlowResourceRecord = (resource: Resource): FlowResourceRecord => ({
  id: resource.id,
  name: resource.name,
  type: resource.type,
  accessOnly: resource.accessOnly,
  metadata: resource.metadata ?? null,
});
