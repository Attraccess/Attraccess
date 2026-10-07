import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { HealthNodesTestScope } from './resource-flows-executor.service.spec';
export function registerHealthNodesSetNodeUsesStaticReasonWhenPayloadReasonAbsent(scope: HealthNodesTestScope): void {
  it('SET node uses static reason when payload reason absent', async () => {
    const resourceId = 16;
    const inputNode = scope.createNode({ id: 'in-set-sr', type: ResourceFlowNodeType.INPUT_BUTTON, resourceId });
    const setNode = scope.createNode({
      id: 'set-sr',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET,
      resourceId,
      data: { identifier: '', status: 'unhealthy', reason: 'static fallback' },
    });
    scope.nodesById[inputNode.id] = inputNode;
    scope.nodesById[setNode.id] = setNode;
    scope.initialNodes = [inputNode];
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: setNode.id }];
    scope.edgesBySourceAndHandle[`${setNode.id}|`] = [];

    await scope.service.runFlow(resourceId, ResourceFlowNodeType.INPUT_BUTTON, {});

    expect(scope.resourceHealthService.reportHealth).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'unhealthy',
        reason: 'static fallback',
        source: 'manual',
      }),
    );
  });
}
