import { Node, Edge } from '@xyflow/react';

export const CLIPBOARD_TYPE = 'attraccess-flow-nodes' as const;

export interface FlowClipboardData {
  type: typeof CLIPBOARD_TYPE;
  nodes: Node[];
  edges: Edge[];
}

export function buildClipboardData(nodes: Node[], edges: Edge[]): FlowClipboardData | null {
  const selectedNodes = nodes.filter((n) => n.selected);
  if (selectedNodes.length === 0) return null;

  const selectedIds = new Set(selectedNodes.map((n) => n.id));
  const selectedEdges = edges.filter(
    (e) => selectedIds.has(e.source) && selectedIds.has(e.target)
  );

  return {
    type: CLIPBOARD_TYPE,
    nodes: selectedNodes.map(({ measured, selected, dragging, ...rest }) => rest as Node),
    edges: selectedEdges.map(({ selected, ...rest }) => rest as Edge),
  };
}

export function parseClipboardData(text: string): FlowClipboardData | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed?.type !== CLIPBOARD_TYPE) return null;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface PasteResult {
  nodes: Node[];
  edges: Edge[];
}

export function buildPastedElements(
  clipboardData: FlowClipboardData,
  generateId: () => string,
  offset = 50,
  targetPosition?: { x: number; y: number },
): PasteResult {
  const idMap = new Map<string, string>();
  clipboardData.nodes.forEach((n) => idMap.set(n.id, generateId()));

  let dx = offset;
  let dy = offset;
  if (targetPosition && clipboardData.nodes.length > 0) {
    const xs = clipboardData.nodes.map((n) => n.position.x);
    const ys = clipboardData.nodes.map((n) => n.position.y);
    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
    dx = targetPosition.x - centerX;
    dy = targetPosition.y - centerY;
  }

  const nodes: Node[] = clipboardData.nodes.map(({ measured, dragging, ...n }) => ({
    ...n,
    id: idMap.get(n.id) ?? generateId(),
    position: { x: n.position.x + dx, y: n.position.y + dy },
    selected: true,
  }));

  const edges: Edge[] = clipboardData.edges
    .filter((e) => idMap.has(e.source) && idMap.has(e.target))
    .map((e) => ({
      ...e,
      id: generateId(),
      source: idMap.get(e.source) ?? e.source,
      target: idMap.get(e.target) ?? e.target,
    }));

  return { nodes, edges };
}
