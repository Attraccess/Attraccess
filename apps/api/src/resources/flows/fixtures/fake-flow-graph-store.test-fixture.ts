import { ResourceFlowNodeType, ResourceType } from '@attraccess/application-models';
import type {
  FlowCanvasInput,
  FlowEdgeRecord,
  FlowNodeRecord,
  FlowRecord,
  FlowResourceRecord,
} from '@attraccess/application-models';
import type { AuditEvent } from '../../../audit/recorder/audit-event';
import {
  FlowCanvasIdConflictError,
  type CanvasAuditFactory,
  type FlowCanvas,
  type FlowGraphStore,
  type GlobalFlowDraft,
  type GlobalFlowSummary,
} from '../flow-graph.port';
import type { FlowResourceDirectory } from '../flow-resource-directory.port';

type Owner = { resourceId: number } | { flowId: number };

const ownsRow = (owner: Owner, row: { resourceId: number | null; flowId: number | null }) =>
  'resourceId' in owner ? row.resourceId === owner.resourceId : row.flowId === owner.flowId;

/**
 * An in-memory FlowGraphStore. Replacing a canvas mimics the adapter's atomicity: the audit event is built and
 * "recorded" before anything is committed, and a failure (id conflict, throwing `onAudit`) leaves the state as it was.
 */
export class FakeFlowGraphStore implements FlowGraphStore {
  nodes: FlowNodeRecord[] = [];
  edges: FlowEdgeRecord[] = [];
  flows: FlowRecord[] = [];
  /** Every audit event the store recorded, in order. */
  auditEvents: AuditEvent[] = [];
  /** Runs when an audit event is recorded; throw to abort the surrounding write. */
  onAudit?: (event: AuditEvent) => void;
  /** Throws while a canvas is written, after the previous one was read. */
  failWrite?: Error;
  private nextFlowId = 1;

  /** Every call, by method name, for specs that count queries. */
  calls: string[] = [];

  addNode(partial: Partial<FlowNodeRecord> & Pick<FlowNodeRecord, 'id' | 'type'>): FlowNodeRecord {
    const node: FlowNodeRecord = {
      position: { x: 0, y: 0 },
      data: {},
      createdAt: new Date(0),
      updatedAt: new Date(0),
      resourceId: null,
      flowId: null,
      ...partial,
    };
    this.nodes.push(node);
    return node;
  }

  addEdge(partial: Partial<FlowEdgeRecord> & Pick<FlowEdgeRecord, 'id' | 'source' | 'target'>): FlowEdgeRecord {
    const edge: FlowEdgeRecord = {
      sourceHandle: null,
      targetHandle: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      resourceId: null,
      flowId: null,
      ...partial,
    };
    this.edges.push(edge);
    return edge;
  }

  addFlow(partial: Partial<FlowRecord> & Pick<FlowRecord, 'name'>): FlowRecord {
    const flow: FlowRecord = {
      id: this.nextFlowId++,
      description: null,
      enabled: true,
      scope: 'global',
      createdAt: new Date(0),
      updatedAt: new Date(0),
      ...partial,
    };
    this.flows.push(flow);
    return flow;
  }

  private canvasOf(owner: Owner): FlowCanvas {
    return {
      nodes: this.nodes.filter((node) => ownsRow(owner, node)),
      edges: this.edges.filter((edge) => ownsRow(owner, edge)),
    };
  }

  async loadResourceCanvas(resourceId: number): Promise<FlowCanvas> {
    this.calls.push('loadResourceCanvas');
    return this.canvasOf({ resourceId });
  }

  async loadGlobalCanvas(flowId: number): Promise<FlowCanvas> {
    this.calls.push('loadGlobalCanvas');
    return this.canvasOf({ flowId });
  }

  async findResourceNodes(resourceId: number, type: ResourceFlowNodeType): Promise<FlowNodeRecord[]> {
    this.calls.push('findResourceNodes');
    return this.nodes.filter((node) => node.resourceId === resourceId && node.type === type);
  }

  async findNodesForResources(resourceIds: number[], type: ResourceFlowNodeType): Promise<FlowNodeRecord[]> {
    this.calls.push('findNodesForResources');
    return this.nodes.filter((node) => resourceIds.includes(node.resourceId as number) && node.type === type);
  }

  async findGlobalFlowNodes(flowId: number): Promise<FlowNodeRecord[]> {
    this.calls.push('findGlobalFlowNodes');
    return this.nodes.filter((node) => node.flowId === flowId);
  }

  async loadEnabledGlobalCanvases(): Promise<Array<{ flow: FlowRecord; canvas: FlowCanvas }>> {
    this.calls.push('loadEnabledGlobalCanvases');
    return this.flows
      .filter((flow) => flow.enabled && flow.scope === 'global')
      .sort((a, b) => a.id - b.id)
      .map((flow) => ({ flow, canvas: this.canvasOf({ flowId: flow.id }) }));
  }

  private record(event: AuditEvent): void {
    this.onAudit?.(event);
    this.auditEvents.push(event);
  }

  private replaceCanvas(owner: Owner, input: FlowCanvasInput, audit: CanvasAuditFactory) {
    const previous = this.canvasOf(owner);
    if (this.failWrite) throw this.failWrite;
    const rest = {
      nodes: this.nodes.filter((node) => !ownsRow(owner, node)),
      edges: this.edges.filter((edge) => !ownsRow(owner, edge)),
    };
    const nodeIds = input.nodes.map((node) => node.id).filter((id) => rest.nodes.some((node) => node.id === id));
    const edgeIds = input.edges.map((edge) => edge.id).filter((id) => rest.edges.some((edge) => edge.id === id));
    if (nodeIds.length > 0 || edgeIds.length > 0) throw new FlowCanvasIdConflictError(nodeIds, edgeIds);

    const columns = {
      resourceId: 'resourceId' in owner ? owner.resourceId : null,
      flowId: 'flowId' in owner ? owner.flowId : null,
    };
    const stamp = new Date();
    const savedNodes: FlowNodeRecord[] = input.nodes.map((node) => ({
      id: node.id,
      type: node.type as ResourceFlowNodeType,
      position: { x: node.position.x, y: node.position.y },
      data: node.data || {},
      createdAt: stamp,
      updatedAt: stamp,
      ...columns,
    }));
    const savedEdges: FlowEdgeRecord[] = input.edges.map((edge) => ({
      ...edge,
      createdAt: stamp,
      updatedAt: stamp,
      ...columns,
    }));
    const event = audit(previous);
    if (event) this.record(event);
    // Commit only now: nothing above may leave a trace when it throws.
    this.nodes = [...rest.nodes, ...savedNodes];
    this.edges = [...rest.edges, ...savedEdges];
    return Promise.resolve({ previous, saved: { nodes: savedNodes, edges: savedEdges } });
  }

  async replaceResourceCanvas(resourceId: number, canvas: FlowCanvasInput, audit: CanvasAuditFactory) {
    this.calls.push('replaceResourceCanvas');
    return this.replaceCanvas({ resourceId }, canvas, audit);
  }

  async replaceGlobalCanvas(flowId: number, canvas: FlowCanvasInput, audit: CanvasAuditFactory) {
    this.calls.push('replaceGlobalCanvas');
    return this.replaceCanvas({ flowId }, canvas, audit);
  }

  async listGlobalFlows(): Promise<GlobalFlowSummary[]> {
    return this.flows
      .filter((flow) => flow.scope === 'global')
      .map((flow) => ({ ...flow, nodeCount: this.nodes.filter((node) => node.flowId === flow.id).length }));
  }

  async findGlobalFlow(flowId: number): Promise<FlowRecord | null> {
    return this.flows.find((flow) => flow.id === flowId && flow.scope === 'global') ?? null;
  }

  async createGlobalFlow(draft: GlobalFlowDraft): Promise<FlowRecord> {
    return this.addFlow(draft);
  }

  async updateGlobalFlow(flow: FlowRecord): Promise<FlowRecord> {
    const index = this.flows.findIndex(({ id }) => id === flow.id);
    this.flows[index] = { ...this.flows[index], ...flow };
    return this.flows[index];
  }

  async deleteGlobalFlow(flowId: number, audit: (canvas: FlowCanvas) => AuditEvent): Promise<boolean> {
    const index = this.flows.findIndex(({ id }) => id === flowId);
    if (index < 0) return false;
    this.record(audit(this.canvasOf({ flowId })));
    this.flows.splice(index, 1);
    this.nodes = this.nodes.filter((node) => node.flowId !== flowId);
    this.edges = this.edges.filter((edge) => edge.flowId !== flowId);
    return true;
  }
}

/** In-memory resources and meters of the flow editor. */
export class FakeFlowResourceDirectory implements FlowResourceDirectory {
  resources = new Map<number, FlowResourceRecord>();
  meters = new Map<number, number[]>();
  /** Rejects the next meter lookup. */
  meterError?: Error;
  meterLookups = 0;

  addResource(id: number, partial: Partial<FlowResourceRecord> = {}): FlowResourceRecord {
    const resource = { id, name: `Resource ${id}`, type: ResourceType.Machine, metadata: null, ...partial };
    this.resources.set(id, resource);
    return resource;
  }

  async find(resourceId: number): Promise<FlowResourceRecord | null> {
    return this.resources.get(resourceId) ?? null;
  }

  async meterIds(resourceId: number): Promise<number[]> {
    this.meterLookups++;
    if (this.meterError) {
      const error = this.meterError;
      this.meterError = undefined;
      throw error;
    }
    return [...(this.meters.get(resourceId) ?? [])];
  }
}
