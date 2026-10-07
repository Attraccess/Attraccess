import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { HealthNodesTestScope } from './resource-flows-executor.service.spec';
export function registerHealthNodesSetNodePayloadHealthIdentifierOverridesStaticIdentifier(
  scope: HealthNodesTestScope,
): void {
  it('SET node payload health.identifier overrides static identifier', async () => {
    const resourceId = 15;
    const inputNode = scope.createNode({ id: 'in-set-id', type: ResourceFlowNodeType.INPUT_BUTTON, resourceId });
    const setNode = scope.createNode({
      id: 'set-id',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET,
      resourceId,
      data: { identifier: 'StaticId', status: 'unhealthy', reason: 'static reason' },
    });
    scope.nodesById[inputNode.id] = inputNode;
    scope.nodesById[setNode.id] = setNode;
    scope.initialNodes = [inputNode];
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: setNode.id }];
    scope.edgesBySourceAndHandle[`${setNode.id}|`] = [];

    await scope.service.runFlow(resourceId, ResourceFlowNodeType.INPUT_BUTTON, {
      health: { identifier: 'PayloadId' },
    });

    expect(scope.resourceHealthService.reportHealth).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'PayloadId',
        status: 'unhealthy',
      }),
    );
  });
}
