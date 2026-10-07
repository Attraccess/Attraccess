import { ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';

export // Helper to create a node
function createNode(partial: Partial<ResourceFlowNode>): ResourceFlowNode {
  return {
    id: 'node-' + Math.random().toString(36).slice(2, 8),
    type: ResourceFlowNodeType.INPUT_BUTTON,
    position: { x: 0, y: 0 },
    data: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    resourceId: 1,
    resource: undefined,
    ...partial,
  } as unknown as ResourceFlowNode;
}
