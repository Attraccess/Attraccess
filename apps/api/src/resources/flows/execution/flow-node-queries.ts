import { FlowScope, ResourceFlowNode, ResourceType } from '@attraccess/database-entities';
import { FindOptionsWhere, IsNull } from 'typeorm';
import { getCoreNodeResourceType } from '../schemas/core-node-schemas';

/** Trigger nodes of enabled global flows. Disabled flows never match. */
export function enabledGlobalNodesWhere(type: string): FindOptionsWhere<ResourceFlowNode> {
  return { type: type as ResourceFlowNode['type'], flow: { enabled: true } };
}

/** Trigger nodes of every resource flow plus those of enabled global flows, in one query. */
export function resourceAndGlobalNodesWhere(type: string): FindOptionsWhere<ResourceFlowNode>[] {
  return [{ type: type as ResourceFlowNode['type'], flowId: IsNull() }, enabledGlobalNodesWhere(type)];
}

/** The nodes of the resource's own flow plus the matching nodes of enabled global flows, in one query. */
export function resourceOwnAndGlobalNodesWhere(resourceId: number, type: string): FindOptionsWhere<ResourceFlowNode>[] {
  return [{ resourceId, type: type as ResourceFlowNode['type'] }, enabledGlobalNodesWhere(type)];
}

export function isGlobalFlowNode(node: Pick<ResourceFlowNode, 'flowId'>): boolean {
  return node.flowId != null;
}

/** A trigger that only exists for one resource type (machine or door triggers) never fires for the other. */
export function triggerAppliesToResourceType(triggerType: string, resourceType: ResourceType | undefined): boolean {
  const restriction = getCoreNodeResourceType(triggerType);
  return restriction === undefined || resourceType === undefined || restriction === resourceType;
}

export function flowScopeOfNode(node: Pick<ResourceFlowNode, 'flowId'>): FlowScope {
  return isGlobalFlowNode(node) ? 'global' : 'resource';
}
