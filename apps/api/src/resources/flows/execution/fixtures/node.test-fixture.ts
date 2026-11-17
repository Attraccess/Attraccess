import { FlowNodeRecord, ResourceFlowNodeType } from '@attraccess/application-models';

// Helper to create a node
export function createNode(partial: Partial<FlowNodeRecord>): FlowNodeRecord {
  return {
    id: 'node-' + Math.random().toString(36).slice(2, 8),
    type: ResourceFlowNodeType.INPUT_BUTTON,
    position: { x: 0, y: 0 },
    data: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    resourceId: 1,
    flowId: null,
    ...partial,
  } as unknown as FlowNodeRecord;
}
