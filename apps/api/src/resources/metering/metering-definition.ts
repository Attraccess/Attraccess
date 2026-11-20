import { z } from 'zod';
import { MeteringDefinitionFlow, ResourceFlowNodeType } from '@attraccess/application-models';

const MeterIdSchema = z.number().int().positive();

const TimeoutSecondsSchema = z.number().int().positive().max(600).default(30);

/**
 * The settings of a meter's start and collect nodes. They mirror the node data schemas the flow editor validates
 * against (`MeteringStartNodeDataSchema`, `MeteringCollectNodeDataSchema`); a persistence test keeps the two equal.
 */
export const MeteringStartSettingsSchema = z.object({
  meterId: MeterIdSchema,
  timeoutSeconds: TimeoutSecondsSchema,
});

export const MeteringCollectSettingsSchema = z.object({
  meterId: MeterIdSchema,
  timeoutSeconds: TimeoutSecondsSchema,
  interimIntervalMinutes: z.number().int().min(0).max(1440).default(1),
  finalAttempts: z.number().int().min(1).max(10).default(3),
  finalRetryDelaySeconds: z.number().int().min(0).max(120).default(5),
});

export type MeterProblem =
  | 'start-trigger-missing'
  | 'ready-unreachable'
  | 'collect-trigger-missing'
  | 'report-unreachable'
  /** Several sessions share the machine, but the meter cannot be read on demand to split its consumption. */
  | 'shared-needs-collect';

export function meterDefinitionFromFlow(meterId: number, { allNodes, edges }: MeteringDefinitionFlow) {
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
    start: MeteringStartSettingsSchema.parse(startNode?.data ?? { meterId }),
    collect: MeteringCollectSettingsSchema.parse(collectNode?.data ?? { meterId }),
    hasCollection: !!collectNode,
  };
}
