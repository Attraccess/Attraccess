import { Resource } from './resource';

export enum ResourceFlowVariableScope {
  RESOURCE = 'resource',
  GLOBAL = 'global',
}

export type ResourceFlowVariableValueType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';

export interface ResourceFlowVariable {
  id: number;
  scope: ResourceFlowVariableScope;
  resourceId: number | null;
  key: string;
  value: string;
  valueType: ResourceFlowVariableValueType;
  createdAt: Date;
  updatedAt: Date;
  resource: Resource | null;
}
