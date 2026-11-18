import type {
  FlowVariableRecord,
  ResourceFlowVariableScope,
  ResourceFlowVariableValueType,
} from '@attraccess/application-models';

export const FLOW_VARIABLE_STORE = Symbol.for('attraccess.flows.variable-store');

export interface FlowVariableKey {
  scope: ResourceFlowVariableScope;
  /** Owning resource; null for global variables. */
  resourceId: number | null;
  key: string;
}

/** Variables of flows: global ones and those of one resource. */
export interface FlowVariableStore {
  find(key: FlowVariableKey): Promise<FlowVariableRecord | null>;
  findMany(scope: ResourceFlowVariableScope, resourceId: number | null, keys: string[]): Promise<FlowVariableRecord[]>;
  /** Every global variable plus those of the resource (when one is given). */
  findVisibleTo(resourceId: number | null): Promise<FlowVariableRecord[]>;
  /** Global variables first, then the resource's, each ordered by key. */
  listForResource(resourceId: number): Promise<FlowVariableRecord[]>;
  /** Inserts or updates the variable; `existing` is the row read before. */
  save(
    key: FlowVariableKey,
    serializedValue: string,
    valueType: ResourceFlowVariableValueType,
    existing: FlowVariableRecord | null,
  ): Promise<FlowVariableRecord>;
  /** True when a row was deleted. */
  delete(key: FlowVariableKey): Promise<boolean>;
}
