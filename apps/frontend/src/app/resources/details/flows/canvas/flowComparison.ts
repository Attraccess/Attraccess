import type { Edge, Node } from '@xyflow/react';
import type { ResourceFlowEdgeDto, ResourceFlowNodeDto } from '@attraccess/react-query-client';

export function areEdgesEqual(edge1: ResourceFlowEdgeDto | Edge, edge2: ResourceFlowEdgeDto | Edge): boolean {
  return edge1.id === edge2.id && edge1.source === edge2.source && edge1.target === edge2.target;
}

// Efficient comparison function to replace expensive JSON.stringify operations
export function areNodesEqual(node1: ResourceFlowNodeDto | Node, node2: ResourceFlowNodeDto | Node): boolean {
  return (
    node1.id === node2.id &&
    node1.type === node2.type &&
    node1.position.x === node2.position.x &&
    node1.position.y === node2.position.y &&
    JSON.stringify(node1.data) === JSON.stringify(node2.data) // Only stringify the smaller data object
  );
}

/** Whether the editor's nodes differ from the saved ones (count, position, type or data). */
export function nodesHaveChanged(originalNodes: ResourceFlowNodeDto[], nodes: Node[]): boolean {
  if (originalNodes.length !== nodes.length) {
    return true;
  }

  // More efficient comparison without JSON.stringify on entire arrays
  for (const originalNode of originalNodes) {
    const currentNode = nodes.find((n) => n.id === originalNode.id);

    if (!currentNode || !areNodesEqual(originalNode, currentNode)) {
      return true;
    }
  }

  return false;
}

/** Whether the editor's edges differ from the saved ones (count, id, source or target). */
export function edgesHaveChanged(originalEdges: ResourceFlowEdgeDto[], edges: Edge[]): boolean {
  if (originalEdges.length !== edges.length) {
    return true;
  }

  for (const originalEdge of originalEdges) {
    const currentEdge = edges.find((e) => e.id === originalEdge.id);

    if (!currentEdge || !areEdgesEqual(originalEdge, currentEdge)) {
      return true;
    }
  }

  return false;
}
