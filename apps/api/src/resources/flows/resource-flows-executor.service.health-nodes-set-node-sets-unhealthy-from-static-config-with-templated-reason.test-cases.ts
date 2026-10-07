import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { HealthNodesTestScope } from './resource-flows-executor.service.spec';
export function registerHealthNodesSetNodeSetsUnhealthyFromStaticConfigWithTemplatedReason(
  scope: HealthNodesTestScope,
): void {
  it('SET node sets unhealthy from static config with templated reason', async () => {
    const resourceId = 12;
    const inputNode = scope.createNode({ id: 'in-set-1', type: ResourceFlowNodeType.INPUT_BUTTON, resourceId });
    const setNode = scope.createNode({
      id: 'set-1',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET,
      resourceId,
      data: { identifier: 'Internal', status: 'unhealthy', reason: 'temp={{temp}}' },
    });
    scope.nodesById[inputNode.id] = inputNode;
    scope.nodesById[setNode.id] = setNode;
    scope.initialNodes = [inputNode];
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: setNode.id }];
    scope.edgesBySourceAndHandle[`${setNode.id}|`] = [];

    await scope.service.runFlow(resourceId, ResourceFlowNodeType.INPUT_BUTTON, { temp: 91 });

    expect(scope.resourceHealthService.reportHealth).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId,
        identifier: 'Internal',
        status: 'unhealthy',
        reason: 'temp=91',
        source: 'manual',
      }),
    );
  });
}
