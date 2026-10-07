import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { HealthNodesTestScope } from './resource-flows-executor.service.spec';
export function registerHealthNodesSetNodeSetsHealthyFromStaticConfigAndClearsReason(
  scope: HealthNodesTestScope,
): void {
  it('SET node sets healthy from static config and clears reason', async () => {
    const resourceId = 13;
    const inputNode = scope.createNode({ id: 'in-set-h', type: ResourceFlowNodeType.INPUT_BUTTON, resourceId });
    const setNode = scope.createNode({
      id: 'set-h',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET,
      resourceId,
      data: { identifier: '', status: 'healthy', reason: '' },
    });
    scope.nodesById[inputNode.id] = inputNode;
    scope.nodesById[setNode.id] = setNode;
    scope.initialNodes = [inputNode];
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: setNode.id }];
    scope.edgesBySourceAndHandle[`${setNode.id}|`] = [];

    await scope.service.runFlow(resourceId, ResourceFlowNodeType.INPUT_BUTTON, {});

    expect(scope.resourceHealthService.reportHealth).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId,
        identifier: '',
        status: 'healthy',
        reason: null,
        source: 'manual',
      }),
    );
  });
}
