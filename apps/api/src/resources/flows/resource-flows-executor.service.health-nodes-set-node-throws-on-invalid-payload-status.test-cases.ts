import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { HealthNodesTestScope } from './resource-flows-executor.service.spec';
export function registerHealthNodesSetNodeThrowsOnInvalidPayloadStatus(scope: HealthNodesTestScope): void {
  it('SET node throws on invalid payload status', async () => {
    const resourceId = 17;
    const inputNode = scope.createNode({ id: 'in-set-bad', type: ResourceFlowNodeType.INPUT_BUTTON, resourceId });
    const setNode = scope.createNode({
      id: 'set-bad',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET,
      resourceId,
      data: { identifier: '', status: 'healthy', reason: '' },
    });
    scope.nodesById[inputNode.id] = inputNode;
    scope.nodesById[setNode.id] = setNode;
    scope.initialNodes = [inputNode];
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: setNode.id }];
    scope.edgesBySourceAndHandle[`${setNode.id}|`] = [];

    await expect(
      scope.service.runFlow(resourceId, ResourceFlowNodeType.INPUT_BUTTON, {
        health: { status: 'maybe' },
      }),
    ).rejects.toThrow(/expected "healthy" or "unhealthy"/);
  });
}
