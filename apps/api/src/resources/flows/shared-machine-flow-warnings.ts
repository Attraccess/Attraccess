import { ResourceFlowEdge, ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { getPluginFlowNode } from '../../plugin-system/flows/node-registry';

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

const EXTERNAL_EFFECT_NODES = new Set<string>([
  ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST,
  ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
  ResourceFlowNodeType.OUTPUT_COMPANION_LOCK_PC,
  ResourceFlowNodeType.OUTPUT_COMPANION_UNLOCK_PC,
]);

function hasExternalEffect(type: string): boolean {
  if (EXTERNAL_EFFECT_NODES.has(type)) return true;
  const plugin = getPluginFlowNode(type);
  return plugin !== undefined && plugin.isInput !== true;
}

const CHECKS_SESSION_COUNT = /^activeSessions(\.|$)/;

/** An IF node checks the count when it reads `activeSessions...` or compares against such a path. */
function checksSessionCount(node: ResourceFlowNode): boolean {
  if (node.type !== ResourceFlowNodeType.PROCESSING_IF) return false;
  const data = (node.data ?? {}) as { path?: unknown; comparisonValue?: unknown; comparisonValueIsPath?: unknown };
  const isCountPath = (value: unknown) => typeof value === 'string' && CHECKS_SESSION_COUNT.test(value.trim());
  return isCountPath(data.path) || (data.comparisonValueIsPath === true && isCountPath(data.comparisonValue));
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
  for (const edge of edges) outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);

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
