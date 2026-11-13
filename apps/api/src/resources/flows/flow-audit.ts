import { AuditDetails } from '../../audit/recorder/audit-event';
import { AUDIT_DETAILS_BYTE_LIMIT, fitAuditText, withinDetailsLimit } from '../../audit/policies/projection';

export const REDACTED = '[redacted]';

const SECRET_KEY = /pass|secret|token|auth|api[-_]?key|credential/i;
/** The password in `scheme://user:password@host`. */
const URL_PASSWORD = /(\b[a-z][a-z\d+.-]*:\/\/[^\s/:@]*:)[^\s/@]*@/gi;
/** A `name=value` query parameter. */
const QUERY_PARAMETER = /([?&])([^=&#\s]+)=([^&#\s]*)/g;

/** Longest flow name recorded with a flow event, in JSON bytes. */
export const FLOW_NAME_BYTES = 256;

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

/** Masks URL passwords and credential-like query parameters inside a text. */
function redactText(text: string): string {
  return text
    .replace(URL_PASSWORD, `$1${REDACTED}@`)
    .replace(QUERY_PARAMETER, (match, separator: string, name: string) =>
      isSecretKey(name) ? `${separator}${name}=${REDACTED}` : match,
    );
}

/** A `{ key, value }` (or `{ name, value }`) entry whose key names a credential or a header, as in Set variables. */
function isSecretEntry(entry: Record<string, unknown>): boolean {
  const label = entry.key ?? entry.name;
  return typeof label === 'string' && (isSecretKey(label) || /^headers?\./i.test(label));
}

/**
 * Replaces credentials in node data: every value under a `headers` object, every value whose key looks like a
 * secret, the value of a key/value entry whose key looks like a secret or a header, and URL passwords and secret
 * query parameters in texts. Best-effort: plugin node schemas are free-form, so an unusual key name can slip through.
 */
export function redactFlowData(value: unknown, insideHeaders = false): unknown {
  if (typeof value === 'string') return insideHeaders ? REDACTED : redactText(value);
  if (Array.isArray(value)) return value.map((item) => redactFlowData(item, insideHeaders));
  if (value === null || typeof value !== 'object') return value;
  const secretEntry = isSecretEntry(value as Record<string, unknown>);
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      insideHeaders || isSecretKey(key) || (secretEntry && key === 'value')
        ? REDACTED
        : redactFlowData(child, key.toLowerCase() === 'headers'),
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

/** The JSON name of each diff list's count. */
const LIST_COUNTS: Record<keyof CanvasDiff, string> = {
  addedNodes: 'addedNodeCount',
  removedNodes: 'removedNodeCount',
  changedNodes: 'changedNodeCount',
  addedEdges: 'addedEdgeCount',
  removedEdges: 'removedEdgeCount',
};

function snapshotJson(canvas: AuditCanvas, detail: Exclude<SnapshotDetail, 'omitted'>): string {
  return JSON.stringify({
    nodes: canvas.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      ...(detail === 'no_data' ? {} : { data: node.data }),
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

const renderLists = (lists: Partial<CanvasDiff>) =>
  Object.fromEntries(Object.entries(lists).map(([key, list]) => [key, JSON.stringify(list)]));

/** Halves the longest non-empty list until the details fit; counts stay in the details next to each list. */
function truncateLists(details: AuditDetails, lists: Partial<CanvasDiff>): AuditDetails {
  const kept: Record<string, unknown[]> = { ...lists };
  let result = { ...details, ...renderLists(kept) };
  while (!withinDetailsLimit(result)) {
    const longest = Object.entries(kept).sort(([, a], [, b]) => b.length - a.length)[0];
    if (!longest || longest[1].length === 0) break;
    kept[longest[0]] = longest[1].slice(0, Math.floor(longest[1].length / 2));
    result = { ...details, ...renderLists(kept) };
  }
  return result;
}

/**
 * Details for an event that carries the canvas as it was before the change. The previous canvas goes in as a redacted
 * JSON string, degraded until the whole details object fits the audit limit: no positions, then no node data, then no
 * snapshot at all. Only then are the diff lists shortened. An event is never dropped for size.
 */
export function canvasDetails(base: AuditDetails, before: AuditCanvas, lists: Partial<CanvasDiff> = {}): AuditDetails {
  const counted: AuditDetails = {
    ...base,
    'before.nodeCount': before.nodes.length,
    'before.edgeCount': before.edges.length,
    ...Object.fromEntries(
      Object.entries(lists).map(([key, list]) => [LIST_COUNTS[key as keyof CanvasDiff], list.length]),
    ),
  };
  const withLists = { ...counted, ...renderLists(lists) };
  const redacted = {
    nodes: before.nodes.map((node) => ({ ...node, data: redactFlowData(node.data ?? {}) as AuditFlowNode['data'] })),
    edges: before.edges,
  };
  for (const detail of SNAPSHOT_STEPS) {
    const snapshot = snapshotJson(redacted, detail);
    // A JSON string never has fewer UTF-8 bytes than characters, so a longer snapshot cannot fit.
    if (snapshot.length > AUDIT_DETAILS_BYTE_LIMIT) continue;
    const details = { ...withLists, 'before.snapshot': snapshot, snapshotDetail: detail };
    if (withinDetailsLimit(details)) return details;
  }
  return truncateLists({ ...counted, snapshotDetail: 'omitted' }, lists);
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
      ...(flowName === undefined ? {} : { flowName: fitAuditText(flowName, FLOW_NAME_BYTES) }),
      'after.nodeCount': after.nodes.length,
      'after.edgeCount': after.edges.length,
    },
    before,
    diff,
  );
}
