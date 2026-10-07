import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { HealthNodesTestScope } from './resource-flows-executor.service.spec';
export function registerHealthNodesSetNodePayloadHealthStatusOverridesStaticStatusAndSwitchesSourceToPayload(
  scope: HealthNodesTestScope,
): void {
  it('SET node payload health.status overrides static status and switches source to payload', async () => {
    const resourceId = 14;
    const inputNode = scope.createNode({ id: 'in-set-ovs', type: ResourceFlowNodeType.INPUT_BUTTON, resourceId });
    const setNode = scope.createNode({
      id: 'set-ovs',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET,
      resourceId,
      data: { identifier: 'ir-bridge', status: 'healthy', reason: 'fallback' },
    });
    scope.nodesById[inputNode.id] = inputNode;
    scope.nodesById[setNode.id] = setNode;
    scope.initialNodes = [inputNode];
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: setNode.id }];
    scope.edgesBySourceAndHandle[`${setNode.id}|`] = [];

    await scope.service.runFlow(resourceId, ResourceFlowNodeType.INPUT_BUTTON, {
      health: { status: 'unhealthy', reason: 'lost wifi' },
    });

    expect(scope.resourceHealthService.reportHealth).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId,
        identifier: 'ir-bridge',
        status: 'unhealthy',
        reason: 'lost wifi',
        source: 'payload',
      }),
    );
  });
}
