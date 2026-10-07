import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { HealthNodesTestScope } from './resource-flows-executor.service.spec';
export function registerHealthNodesTriggersHeartbeatUnhealthyReportWhenTimeoutElapsed(
  scope: HealthNodesTestScope,
): void {
  it('triggers heartbeat unhealthy report when timeout elapsed', async () => {
    const resourceId = 18;
    const heartbeatNode = scope.createNode({
      id: 'hb-timeout',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT,
      resourceId,
      data: { identifier: 'ir-bridge', timeoutSeconds: 60, unhealthyReason: 'no signal' },
    });

    (scope.flowNodeRepository.find as jest.Mock).mockResolvedValueOnce([heartbeatNode]);

    const heartbeatLastSeen = (scope.service as unknown as { heartbeatLastSeen: Map<string, Date> }).heartbeatLastSeen;
    heartbeatLastSeen.set(`${resourceId}::ir-bridge`, new Date(Date.now() - 5 * 60 * 1000));

    await scope.service.checkHealthHeartbeats();

    expect(scope.resourceHealthService.reportHealth).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId,
        identifier: 'ir-bridge',
        status: 'unhealthy',
        reason: 'no signal',
        source: 'heartbeat',
      }),
    );
  });
}
