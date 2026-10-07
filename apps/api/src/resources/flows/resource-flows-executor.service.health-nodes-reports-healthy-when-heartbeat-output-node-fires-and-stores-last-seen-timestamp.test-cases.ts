import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { HealthNodesTestScope } from './resource-flows-executor.service.spec';
export function registerHealthNodesReportsHealthyWhenHeartbeatOutputNodeFiresAndStoresLastSeenTimestamp(
  scope: HealthNodesTestScope,
): void {
  it('reports healthy when heartbeat output node fires and stores last seen timestamp', async () => {
    const resourceId = 11;
    const inputNode = scope.createNode({ id: 'in-hb', type: ResourceFlowNodeType.INPUT_BUTTON, resourceId });
    const heartbeatNode = scope.createNode({
      id: 'heartbeat-1',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT,
      resourceId,
      data: { identifier: 'ir-bridge', timeoutSeconds: 60, unhealthyReason: 'no signal' },
    });
    scope.nodesById[inputNode.id] = inputNode;
    scope.nodesById[heartbeatNode.id] = heartbeatNode;
    scope.initialNodes = [inputNode];
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: heartbeatNode.id }];
    scope.edgesBySourceAndHandle[`${heartbeatNode.id}|`] = [];

    await scope.service.runFlow(resourceId, ResourceFlowNodeType.INPUT_BUTTON, {});

    expect(scope.resourceHealthService.reportHealth).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId,
        identifier: 'ir-bridge',
        status: 'healthy',
        source: 'heartbeat',
      }),
    );

    const lastSeen = scope.service.getHeartbeatLastSeen(resourceId, 'ir-bridge');
    expect(lastSeen).toBeInstanceOf(Date);
  });
}
