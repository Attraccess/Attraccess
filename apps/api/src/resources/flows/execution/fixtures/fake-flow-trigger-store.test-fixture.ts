import { ResourceFlowNodeType, ResourceType } from '@attraccess/application-models';
import type { FlowEdgeRecord, FlowNodeRecord } from '@attraccess/application-models';
import type { FlowTriggerStore } from '../../flow-trigger-store.port';

/** A node as the specs build it: the enabled flag of its global flow rides along as `flow`. */
export type FakeFlowNode = FlowNodeRecord & { flow?: { enabled: boolean } | null };

/** An edge of the specs; owner fields are optional and only checked when set. */
export type FakeFlowEdge = Partial<FlowEdgeRecord> & { source: string; target: string };

/** What the fake store serves; specs keep one object and mutate it between runs. */
export interface FakeFlowWorld {
  /** Every node, for the lookups by trigger type. */
  initialNodes: FakeFlowNode[];
  /** Nodes by id, for the node an edge leads to. */
  nodesById: Record<string, FakeFlowNode>;
  /** Edges by `${sourceId}|${handle}` ('' when the handle is null). */
  edgesBySourceAndHandle: Record<string, FakeFlowEdge[]>;
}

/** Mirrors the owner condition of the real store: the node's global flow, or its resource's own flow. */
function sameOwner(row: { flowId?: number | null; resourceId?: number | null }, node: FlowNodeRecord): boolean {
  if (node.flowId != null) return row.flowId === undefined || row.flowId === node.flowId;
  if (row.flowId !== undefined && row.flowId !== null) return false;
  return row.resourceId === undefined || row.resourceId === node.resourceId;
}

const isEnabledGlobal = (node: FakeFlowNode) => (node.flowId ?? null) !== null && (node.flow?.enabled ?? true);
const isResourceNode = (node: FakeFlowNode) => (node.flowId ?? null) === null;

/** An in-memory FlowTriggerStore whose methods are jest mocks, so specs can assert and override them. */
export function createFakeFlowTriggerStore(world: FakeFlowWorld) {
  const byType = (type: string) => world.initialNodes.filter((node) => node.type === type);
  return {
    findOutgoingEdges: jest.fn(async (node: FlowNodeRecord, outputHandle: string | undefined) => {
      const key = `${node.id}|${outputHandle ?? ''}`;
      // Edges without owner fields belong to whatever canvas asks for them.
      return (world.edgesBySourceAndHandle[key] ?? []).filter((edge) => sameOwner(edge, node)) as FlowEdgeRecord[];
    }),
    findNodeOnCanvasOf: jest.fn(async (node: FlowNodeRecord, nodeId: string) => {
      const target = world.nodesById[nodeId];
      return target && sameOwner(target, node) ? target : null;
    }),
    findTriggerNodes: jest.fn(async (type: string) =>
      byType(type).filter((node) => isResourceNode(node) || isEnabledGlobal(node)),
    ),
    findTriggerNodesForResource: jest.fn(async (resourceId: number, type: string) =>
      byType(type).filter((node) => (isResourceNode(node) && node.resourceId === resourceId) || isEnabledGlobal(node)),
    ),
    findVariableTriggerNodes: jest.fn(async (resourceId: number | null) =>
      byType(ResourceFlowNodeType.INPUT_VARIABLE_CHANGED).filter(
        (node) =>
          isEnabledGlobal(node) || (isResourceNode(node) && (resourceId === null || node.resourceId === resourceId)),
      ),
    ),
    findButton: jest.fn(
      async (resourceId: number, buttonId: string) =>
        world.initialNodes.find(
          (node) =>
            node.resourceId === resourceId && node.type === ResourceFlowNodeType.INPUT_BUTTON && node.id === buttonId,
        ) ?? null,
    ),
    findPluginTriggerPage: jest.fn(async (type: string, afterNodeId: string | undefined, limit: number) =>
      byType(type)
        .filter((node) => afterNodeId === undefined || node.id > afterNodeId)
        .filter((node) => isResourceNode(node) || isEnabledGlobal(node))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .slice(0, limit),
    ),
    findInactivityTargets: jest.fn(async () => []),
    findResource: jest.fn(async (resourceId: number) => ({
      id: resourceId,
      name: `Resource ${resourceId}`,
      type: ResourceType.Machine,
      metadata: { zone: 'A' } as Record<string, unknown> | null,
    })),
  } satisfies FlowTriggerStore;
}

export type FakeFlowTriggerStore = ReturnType<typeof createFakeFlowTriggerStore>;
