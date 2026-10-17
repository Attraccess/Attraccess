import Dagre from '@dagrejs/dagre';
import { Edge, Node } from '@xyflow/react';

export function getLayoutedElements(nodes: Node[], edges: Edge[], sourceHandles: Map<string, string[]> = new Map()) {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB' });
  edges.forEach((edge) => g.setEdge(edge.source, edge.target));
  nodes.forEach((node) =>
    g.setNode(node.id, {
      width: node.measured?.width ?? 0,
      height: node.measured?.height ?? 0,
    }),
  );
  // Dagre otherwise sees all outgoing edges as starting at the node's centre.
  // Constrain sibling targets using the rendered handles, including plugin nodes.
  const constraints: { left: string; right: string }[] = [];
  const ordering = new Dagre.graphlib.Graph();
  const reaches = (from: string, to: string, visited = new Set<string>()): boolean => {
    if (from === to) return true;
    if (visited.has(from)) return false;
    visited.add(from);
    return (ordering.successors(from) ?? []).some((next) => reaches(next, to, visited));
  };
  for (const [source, handles] of sourceHandles) {
    if (handles.length < 2) continue;
    const outgoing = edges.flatMap((edge) => {
      const port = edge.sourceHandle == null ? -1 : handles.indexOf(edge.sourceHandle);
      return edge.source === source && port >= 0 ? [{ target: edge.target, port }] : [];
    });
    for (const left of outgoing) {
      for (const right of outgoing) {
        if (left.port >= right.port || reaches(right.target, left.target)) continue;
        // Shared targets can impose contradictory orders; never feed a cycle to Dagre.
        ordering.setEdge(left.target, right.target);
        constraints.push({ left: left.target, right: right.target });
      }
    }
  }
  Dagre.layout(g, { constraints });
  return {
    nodes: nodes.map((node) => {
      const position = g.node(node.id);
      return {
        ...node,
        position: {
          x: position.x - (node.measured?.width ?? 0) / 2,
          y: position.y - (node.measured?.height ?? 0) / 2,
        },
      };
    }),
    edges,
  };
}
