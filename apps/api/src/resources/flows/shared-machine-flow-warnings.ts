import {
  IfNodeDataSchema,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceFlowNodeType,
} from '@attraccess/database-entities';
import { getPluginFlowNode } from '../../plugin-system/flows/node-registry';
import { coreNodeHasExternalEffect } from './schemas/core-node-schemas';

export interface SharedMachineFlowWarning {
  triggerNodeId: string;
  triggerType: string;
  /** Nodes with an external effect that a start, stop or takeover reaches without an active session check. */
  effectNodes: { nodeId: string; nodeType: string }[];
}

const SESSION_TRIGGERS = new Set<string>([
  ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
  ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
  ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER,
]);

/** Core effect nodes are marked in the node presentations; plugin nodes count when they act as outputs. */
function hasExternalEffect(type: string): boolean {
  if (coreNodeHasExternalEffect(type)) return true;
  const plugin = getPluginFlowNode(type);
  if (!plugin || plugin.isInput === true) return false;
  return plugin.isOutput === true || plugin.getFailureBehavior !== undefined;
}

const CHECKS_SESSION_COUNT = /^activeSessions\.(before|after)$/;

/** An IF node checks the count when it reads `activeSessions.before/after` or compares against such a path. */
function checksSessionCount(node: ResourceFlowNode): boolean {
  if (node.type !== ResourceFlowNodeType.PROCESSING_IF) return false;
  const parsed = IfNodeDataSchema.safeParse(node.data ?? {});
  if (!parsed.success) return false;
  const { path, comparisonValue, comparisonValueIsPath } = parsed.data;
  const isCountPath = (value: string) => CHECKS_SESSION_COUNT.test(value.trim());
  return isCountPath(path) || (comparisonValueIsPath && isCountPath(comparisonValue));
}

/**
 * Which start, stop and takeover triggers lead to an external effect on some path that never passes an IF node
 * checking `activeSessions`. On a machine shared by several people such a flow runs for every single session.
 */
export function findFlowsWithoutSessionCountCheck(
  nodes: ResourceFlowNode[],
  edges: ResourceFlowEdge[],
): SharedMachineFlowWarning[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    const targets = outgoing.get(edge.source) ?? [];
    targets.push(edge.target);
    outgoing.set(edge.source, targets);
  }

  const warnings: SharedMachineFlowWarning[] = [];
  for (const trigger of nodes.filter((node) => SESSION_TRIGGERS.has(node.type))) {
    const unguardedEffects = new Map<string, string>();
    const visited = new Set<string>([trigger.id]);
    const queue = [...(outgoing.get(trigger.id) ?? [])];
    while (queue.length > 0) {
      const id = queue.shift() as string;
      if (visited.has(id)) continue;
      visited.add(id);
      const node = nodesById.get(id);
      // Everything behind a count check is the flow's own decision: stop following this path.
      if (!node || checksSessionCount(node)) continue;
      if (hasExternalEffect(node.type)) unguardedEffects.set(node.id, node.type);
      queue.push(...(outgoing.get(id) ?? []));
    }
    if (unguardedEffects.size > 0) {
      warnings.push({
        triggerNodeId: trigger.id,
        triggerType: trigger.type,
        effectNodes: [...unguardedEffects].map(([nodeId, nodeType]) => ({ nodeId, nodeType })),
      });
    }
  }
  return warnings;
}
