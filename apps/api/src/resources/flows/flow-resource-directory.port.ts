import type { FlowResourceRecord } from '@attraccess/application-models';

export const FLOW_RESOURCE_DIRECTORY = Symbol.for('attraccess.flows.resource-directory');

/** What the flow editor needs to know about resources. */
export interface FlowResourceDirectory {
  find(resourceId: number): Promise<FlowResourceRecord | null>;
  /** The ids of the meters that belong to the resource. */
  meterIds(resourceId: number): Promise<number[]>;
}
