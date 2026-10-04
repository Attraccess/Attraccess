import {
  MeteringCollectNodeDataSchema,
  MeteringStartNodeDataSchema,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceFlowNodeType,
} from '@attraccess/database-entities';

export type MeterProblem =
  'start-trigger-missing' | 'ready-unreachable' | 'collect-trigger-missing' | 'report-unreachable';

export function meterDefinitionFromFlow(
  meterId: number,
  {
    allNodes,
    edges,
  }: {
    allNodes: ResourceFlowNode[];
    edges: ResourceFlowEdge[];
  },
) {
  const nodes = allNodes.filter((n) => !String(n.type).includes('.metering.') || n.data?.meterId === meterId);
  const reachable = (triggerType: ResourceFlowNodeType, sinkType: ResourceFlowNodeType): boolean => {
    const types = new Map(nodes.map((node) => [node.id, node.type]));
    const queue = nodes.filter((node) => node.type === triggerType).map((node) => node.id);
    const seen = new Set(queue);
    while (queue.length) {
      const id = queue.shift() as string;
      if (types.get(id) === sinkType) return true;
      for (const edge of edges) {
        if (edge.source === id && types.has(edge.target) && !seen.has(edge.target)) {
          seen.add(edge.target);
          queue.push(edge.target);
        }
      }
    }
    return false;
  };
  const has = (type: ResourceFlowNodeType) => nodes.some((node) => node.type === type);
  const problems: MeterProblem[] = [];
  if (!has(ResourceFlowNodeType.INPUT_METERING_START)) problems.push('start-trigger-missing');
  else if (!reachable(ResourceFlowNodeType.INPUT_METERING_START, ResourceFlowNodeType.OUTPUT_METERING_READY)) {
    problems.push('ready-unreachable');
  }
  if (!has(ResourceFlowNodeType.INPUT_METERING_COLLECT)) problems.push('collect-trigger-missing');
  else if (!reachable(ResourceFlowNodeType.INPUT_METERING_COLLECT, ResourceFlowNodeType.OUTPUT_METERING_REPORT)) {
    problems.push('report-unreachable');
  }
  const startNode = nodes.find((node) => node.type === ResourceFlowNodeType.INPUT_METERING_START);
  const collectNode = nodes.find((node) => node.type === ResourceFlowNodeType.INPUT_METERING_COLLECT);
  const reportNodes = nodes.filter((node) => node.type === ResourceFlowNodeType.OUTPUT_METERING_REPORT);
  const incrementOnly =
    reportNodes.length > 0 &&
    reportNodes.every((node) => node.data?.mode === 'increment') &&
    !startNode &&
    !collectNode;
  return {
    configured: incrementOnly || problems.length === 0,
    problems: incrementOnly ? [] : problems,
    incrementOnly,
    start: MeteringStartNodeDataSchema.parse(startNode?.data ?? { meterId }),
    collect: MeteringCollectNodeDataSchema.parse(collectNode?.data ?? { meterId }),
    hasCollection: !!collectNode,
  };
}
