import { auditResourceName } from '../resources.service';
import { AuditDetails } from '../../audit/recorder/audit-event';
import { withinDetailsLimit } from '../../audit/policies/projection';

export const REDACTED = '[redacted]';

const SECRET_KEY = /pass|secret|token|auth|api[-_]?key|credential/i;

/** A canvas node as audited. Positions are only recorded in the fullest snapshot. */
export interface AuditFlowNode {
  id: string;
  type: string;
  data?: Record<string, unknown> | null;
  position?: { x: number; y: number } | null;
}

export interface AuditFlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface AuditCanvas {
  nodes: AuditFlowNode[];
  edges: AuditFlowEdge[];
}

export type SnapshotDetail = 'full' | 'no_positions' | 'no_data' | 'omitted';

export const isSecretKey = (key: string): boolean => SECRET_KEY.test(key);

/**
 * Replaces credentials in node data: every value under a `headers` object and every value whose key looks like a
 * secret. Best-effort: plugin node schemas are free-form, so an unusual key name can slip through.
 */
export function redactFlowData(value: unknown, insideHeaders = false): unknown {
  if (Array.isArray(value)) return value.map((item) => redactFlowData(item, insideHeaders));
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      insideHeaders || isSecretKey(key) ? REDACTED : redactFlowData(child, key.toLowerCase() === 'headers'),
    ]),
  );
}

/** JSON with sorted keys, so equal data compares equal however the database or the client ordered it. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, child) =>
    child && typeof child === 'object' && !Array.isArray(child)
      ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a.localeCompare(b)))
      : child,
  );
}

const nodeRef = (node: AuditFlowNode) => ({ id: node.id, type: node.type });

const edgeKey = (edge: AuditFlowEdge) =>
  stableJson([edge.source, edge.target, edge.sourceHandle ?? null, edge.targetHandle ?? null]);

export interface CanvasDiff {
  addedNodes: Array<{ id: string; type: string }>;
  removedNodes: Array<{ id: string; type: string }>;
  changedNodes: Array<{ id: string; type: string }>;
  addedEdges: string[];
  removedEdges: string[];
}

/**
 * What a canvas save changes. Nodes and edges are identified by id; a node is changed when its type or data differ
 * (position-only moves are not), an edge whose endpoints differ counts as removed and added.
 * Returns null when nothing changed.
 */
export function diffCanvas(before: AuditCanvas, after: AuditCanvas): CanvasDiff | null {
  const beforeNodes = new Map(before.nodes.map((node) => [node.id, node]));
  const afterNodes = new Map(after.nodes.map((node) => [node.id, node]));
  const beforeEdges = new Map(before.edges.map((edge) => [edge.id, edge]));
  const afterEdges = new Map(after.edges.map((edge) => [edge.id, edge]));
  const sameEdge = (id: string) => {
    const [previous, next] = [beforeEdges.get(id), afterEdges.get(id)];
    return previous !== undefined && next !== undefined && edgeKey(previous) === edgeKey(next);
  };

  const diff: CanvasDiff = {
    addedNodes: after.nodes.filter((node) => !beforeNodes.has(node.id)).map(nodeRef),
    removedNodes: before.nodes.filter((node) => !afterNodes.has(node.id)).map(nodeRef),
    changedNodes: after.nodes
      .filter((node) => {
        const previous = beforeNodes.get(node.id);
        return (
          previous !== undefined &&
          (previous.type !== node.type || stableJson(previous.data ?? {}) !== stableJson(node.data ?? {}))
        );
      })
      .map(nodeRef),
    addedEdges: after.edges.filter((edge) => !sameEdge(edge.id)).map((edge) => edge.id),
    removedEdges: before.edges.filter((edge) => !sameEdge(edge.id)).map((edge) => edge.id),
  };
  return Object.values(diff).some((list) => list.length > 0) ? diff : null;
}

function snapshotJson(canvas: AuditCanvas, detail: Exclude<SnapshotDetail, 'omitted'>): string {
  return JSON.stringify({
    nodes: canvas.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      ...(detail === 'no_data' ? {} : { data: redactFlowData(node.data ?? {}) }),
      ...(detail === 'full' && node.position ? { position: { x: node.position.x, y: node.position.y } } : {}),
    })),
    edges: canvas.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
    })),
  });
}

const SNAPSHOT_STEPS: Array<Exclude<SnapshotDetail, 'omitted'>> = ['full', 'no_positions', 'no_data'];

/** Halves the longest non-empty list until the details fit; counts stay in the details next to each list. */
function truncateLists(details: AuditDetails, lists: Record<string, unknown[]>): AuditDetails {
  const kept = Object.fromEntries(Object.entries(lists).map(([key, list]) => [key, list.slice()]));
  const render = () => ({
    ...details,
    ...Object.fromEntries(Object.entries(kept).map(([key, list]) => [key, JSON.stringify(list)])),
  });
  let result = render();
  while (!withinDetailsLimit(result)) {
    const longest = Object.entries(kept).sort(([, a], [, b]) => b.length - a.length)[0];
    if (!longest || longest[1].length === 0) break;
    kept[longest[0]] = longest[1].slice(0, Math.floor(longest[1].length / 2));
    result = render();
  }
  return result;
}

/**
 * Details for an event that carries the canvas as it was before the change. The previous canvas goes in as a JSON
 * string, degraded until the whole details object fits the audit limit: no positions, then no node data, then no
 * snapshot at all. The diff lists are shortened last. An event is never dropped for size.
 */
export function canvasDetails(
  base: AuditDetails,
  before: AuditCanvas,
  lists: Record<string, unknown[]> = {},
): AuditDetails {
  const counted: AuditDetails = {
    ...base,
    'before.nodeCount': before.nodes.length,
    'before.edgeCount': before.edges.length,
    ...Object.fromEntries(Object.entries(lists).map(([key, list]) => [`${key.replace(/s$/, '')}Count`, list.length])),
  };
  const render = (extra: AuditDetails) => truncateLists({ ...counted, ...extra }, lists);
  for (const detail of SNAPSHOT_STEPS) {
    const details = render({ 'before.snapshot': snapshotJson(before, detail), snapshotDetail: detail });
    if (withinDetailsLimit(details)) return details;
  }
  return render({ snapshotDetail: 'omitted' });
}

/** Details of a canvas save: counts, the diff and the previous canvas. `flowName` is set for global flows. */
export function canvasSaveDetails(
  before: AuditCanvas,
  after: AuditCanvas,
  diff: CanvasDiff,
  flowName?: string,
): AuditDetails {
  return canvasDetails(
    {
      ...(flowName === undefined ? {} : { flowName: auditResourceName(flowName, 256) }),
      'after.nodeCount': after.nodes.length,
      'after.edgeCount': after.edges.length,
    },
    before,
    { ...diff },
  );
}
