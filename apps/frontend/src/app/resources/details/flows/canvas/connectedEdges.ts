import type { Edge, Node } from '@xyflow/react';

/**
 * The edges whose source and target are both among the nodes. Flows saved before deleting a node took its edges along
 * may still hold edges to missing nodes, which the API refuses.
 */
export function connectedEdges(nodes: Node[], edges: Edge[]): Edge[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  return edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
}
