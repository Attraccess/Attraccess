import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { HealthNodesTestScope } from './resource-flows-executor.service.spec';
export function registerHealthNodesUsesDefaultReasonWhenUnhealthyReasonIsBlankOnHeartbeatTimeout(
  scope: HealthNodesTestScope,
): void {
  it('uses default reason when unhealthyReason is blank on heartbeat timeout', async () => {
    const resourceId = 21;
    const heartbeatNode = scope.createNode({
      id: 'hb-default-reason',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT,
      resourceId,
      data: { identifier: '', timeoutSeconds: 30, unhealthyReason: '' },
    });

    (scope.flowNodeRepository.find as jest.Mock).mockResolvedValueOnce([heartbeatNode]);

    const heartbeatLastSeen = (scope.service as unknown as { heartbeatLastSeen: Map<string, Date> }).heartbeatLastSeen;
    heartbeatLastSeen.set(`${resourceId}::`, new Date(Date.now() - 5 * 60 * 1000));

    await scope.service.checkHealthHeartbeats();

    expect(scope.resourceHealthService.reportHealth).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'Heartbeat timed out',
      }),
    );
  });
}
