import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { HealthNodesTestScope } from './resource-flows-executor.service.spec';
export function registerHealthNodesDoesNotTriggerHeartbeatUnhealthyWhenWithinTimeout(
  scope: HealthNodesTestScope,
): void {
  it('does not trigger heartbeat unhealthy when within timeout', async () => {
    const resourceId = 19;
    const heartbeatNode = scope.createNode({
      id: 'hb-fresh',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT,
      resourceId,
      data: { identifier: '', timeoutSeconds: 60, unhealthyReason: '' },
    });

    (scope.flowNodeRepository.find as jest.Mock).mockResolvedValueOnce([heartbeatNode]);

    const heartbeatLastSeen = (scope.service as unknown as { heartbeatLastSeen: Map<string, Date> }).heartbeatLastSeen;
    heartbeatLastSeen.set(`${resourceId}::`, new Date(Date.now() - 10 * 1000));

    await scope.service.checkHealthHeartbeats();

    expect(scope.resourceHealthService.reportHealth).not.toHaveBeenCalled();
  });
}
