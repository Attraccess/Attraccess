import { isPublishableTopic, isValidTopicFilter, type TopicSuggestions } from '../../../../mqtt/explorer/topics';

// The nodes that talk to an MQTT server; each carries `data.serverId` and `data.topic`.
const MQTT_NODE_TYPES = new Set([
  'input.mqtt.message.received',
  'output.mqtt.sendMessage',
  'processing.mqtt.waitForMessage',
]);

interface EditorNode {
  type?: string;
  data?: unknown;
}

interface MqttNodeUse {
  serverId: number;
  topic: string;
}

const isTemplated = (topic: string) => topic.includes('{{') || topic.includes('{%');

// Reads the editor state, unsaved changes included.
export function readMqttNodes(nodes: readonly EditorNode[]): MqttNodeUse[] {
  const uses: MqttNodeUse[] = [];
  for (const node of nodes) {
    if (!node.type || !MQTT_NODE_TYPES.has(node.type)) continue;
    const data = (node.data ?? {}) as { serverId?: unknown; topic?: unknown };
    if (typeof data.serverId !== 'number' || !Number.isInteger(data.serverId) || data.serverId <= 0) continue;
    uses.push({ serverId: data.serverId, topic: typeof data.topic === 'string' ? data.topic.trim() : '' });
  }
  return uses;
}

/**
 * Whether the editor holds the flow's nodes. The editor copies them out of the loaded flow in an effect, so
 * the first render after the load still has none; a failed load never gets any, so it counts as settled.
 */
export function editorHoldsFlowNodes(flow: {
  isError: boolean;
  loaded: { nodes: readonly unknown[] } | undefined;
  editorNodeCount: number;
}): boolean {
  if (flow.loaded) return flow.editorNodeCount > 0 || flow.loaded.nodes.length === 0;
  return flow.isError;
}

/** The server most used by the flow's MQTT nodes among the existing servers, else the first by name. */
export function pickDefaultServerId(
  nodes: readonly EditorNode[],
  servers: readonly { id: number; name: string }[],
): number | null {
  if (servers.length === 0) return null;
  const counts = new Map<number, number>();
  for (const use of readMqttNodes(nodes)) counts.set(use.serverId, (counts.get(use.serverId) ?? 0) + 1);
  let best: number | null = null;
  for (const server of servers) {
    const count = counts.get(server.id) ?? 0;
    if (count > 0 && (best === null || count > (counts.get(best) ?? 0))) best = server.id;
  }
  if (best !== null) return best;
  return [...servers].sort((a, b) => a.name.localeCompare(b.name))[0].id;
}

/** Concrete topics of this server's nodes, as filters to watch and as topics to publish to. */
export function suggestTopics(nodes: readonly EditorNode[], serverId: number): TopicSuggestions {
  const topics = readMqttNodes(nodes)
    .filter((use) => use.serverId === serverId && use.topic !== '' && !isTemplated(use.topic))
    .map((use) => use.topic);
  return {
    filters: [...new Set(topics.filter(isValidTopicFilter))],
    topics: [...new Set(topics.filter(isPublishableTopic))],
  };
}
