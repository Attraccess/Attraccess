import type { FlowNodeRecord, ResourceType } from '@attraccess/application-models';
import { getCoreNodeResourceType } from '../schemas/core-node-schemas';

export function isGlobalFlowNode(node: Pick<FlowNodeRecord, 'flowId'>): boolean {
  return node.flowId != null;
}

/** A trigger that only exists for one resource type (machine or door triggers) never fires for the other. */
export function triggerAppliesToResourceType(triggerType: string, resourceType: ResourceType | undefined): boolean {
  const restriction = getCoreNodeResourceType(triggerType);
  return restriction === undefined || resourceType === undefined || restriction === resourceType;
}
