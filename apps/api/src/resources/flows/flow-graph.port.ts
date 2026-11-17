import type {
  FlowCanvasInput,
  FlowEdgeRecord,
  FlowNodeRecord,
  FlowRecord,
  ResourceFlowNodeType,
} from '@attraccess/application-models';
import type { AuditEvent } from '../../audit/recorder/audit-event';

export const FLOW_GRAPH_STORE = Symbol.for('attraccess.flows.graph-store');

/** The nodes and edges of one flow: a resource's own flow or a global flow. */
export interface FlowCanvas {
  nodes: FlowNodeRecord[];
  edges: FlowEdgeRecord[];
}

export interface GlobalFlowSummary extends FlowRecord {
  nodeCount: number;
}

export interface GlobalFlowDraft {
  name: string;
  description: string | null;
  enabled: boolean;
}

/** Node and edge ids are global; a saved canvas must not take ids that another flow owns. */
export class FlowCanvasIdConflictError extends Error {
  constructor(
    readonly nodeIds: string[],
    readonly edgeIds: string[],
  ) {
    super('Canvas ids are already used by another flow');
    this.name = 'FlowCanvasIdConflictError';
  }
}

/** Builds the audit event of a write from the canvas it replaced; undefined records nothing. */
export type CanvasAuditFactory = (previous: FlowCanvas) => AuditEvent | undefined;

/**
 * Flow definitions: the canvases of resources and the named global flows. Replacing or deleting a canvas is atomic:
 * the previous canvas is read, the rows are replaced, and the audit row (when the factory returns one) commits or
 * rolls back with them.
 */
export interface FlowGraphStore {
  loadResourceCanvas(resourceId: number): Promise<FlowCanvas>;
  loadGlobalCanvas(flowId: number): Promise<FlowCanvas>;

  /** The nodes of a resource's flow with the given type. */
  findResourceNodes(resourceId: number, type: ResourceFlowNodeType): Promise<FlowNodeRecord[]>;
  findNodesForResources(resourceIds: number[], type: ResourceFlowNodeType): Promise<FlowNodeRecord[]>;
  /** The nodes of one global flow. */
  findGlobalFlowNodes(flowId: number): Promise<FlowNodeRecord[]>;

  /** Every enabled global flow with its canvas, lowest id first. */
  loadEnabledGlobalCanvases(): Promise<Array<{ flow: FlowRecord; canvas: FlowCanvas }>>;

  /**
   * Replaces the canvas of a resource. Throws {@link FlowCanvasIdConflictError} (and changes nothing) when a node or
   * edge id belongs to another flow. Returns the canvas that was replaced and the one that was saved.
   */
  replaceResourceCanvas(
    resourceId: number,
    canvas: FlowCanvasInput,
    audit: CanvasAuditFactory,
  ): Promise<{ previous: FlowCanvas; saved: FlowCanvas }>;
  replaceGlobalCanvas(
    flowId: number,
    canvas: FlowCanvasInput,
    audit: CanvasAuditFactory,
  ): Promise<{ previous: FlowCanvas; saved: FlowCanvas }>;

  listGlobalFlows(): Promise<GlobalFlowSummary[]>;
  /** Only flows of the global scope. */
  findGlobalFlow(flowId: number): Promise<FlowRecord | null>;
  createGlobalFlow(draft: GlobalFlowDraft): Promise<FlowRecord>;
  /** Saves the metadata of a global flow (name, description, enabled). */
  updateGlobalFlow(flow: FlowRecord): Promise<FlowRecord>;
  /**
   * Deletes a flow with its canvas. The canvas is read in the same transaction, so the audit row holds exactly what
   * was deleted. Returns false (recording nothing) when a concurrent delete got there first.
   */
  deleteGlobalFlow(flowId: number, audit: (canvas: FlowCanvas) => AuditEvent): Promise<boolean>;
}
