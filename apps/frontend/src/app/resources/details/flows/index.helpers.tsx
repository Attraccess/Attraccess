import { Edge } from '@xyflow/react';
import { ResourceFlowEdgeDto } from '@attraccess/react-query-client';
import { Node } from '@xyflow/react';
import { ResourceFlowNodeDto } from '@attraccess/react-query-client';

export function areEdgesEqual(edge1: ResourceFlowEdgeDto | Edge, edge2: ResourceFlowEdgeDto | Edge): boolean {
  return edge1.id === edge2.id && edge1.source === edge2.source && edge1.target === edge2.target;
}

export // Efficient comparison functions to replace expensive JSON.stringify operations
function areNodesEqual(node1: ResourceFlowNodeDto | Node, node2: ResourceFlowNodeDto | Node): boolean {
  return (
    node1.id === node2.id &&
    node1.type === node2.type &&
    node1.position.x === node2.position.x &&
    node1.position.y === node2.position.y &&
    JSON.stringify(node1.data) === JSON.stringify(node2.data) // Only stringify the smaller data object
  );
}
