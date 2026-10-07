import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { HealthNodesTestScope } from './resource-flows-executor.service.spec';
export function registerHealthNodesInitialisesLastSeenOnFirstHeartbeatTickWhenNotPreviouslySet(
  scope: HealthNodesTestScope,
): void {
  it('initialises last-seen on first heartbeat tick when not previously set', async () => {
    const resourceId = 20;
    const heartbeatNode = scope.createNode({
      id: 'hb-firsttick',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT,
      resourceId,
      data: { identifier: '', timeoutSeconds: 60, unhealthyReason: '' },
    });

    (scope.flowNodeRepository.find as jest.Mock).mockResolvedValueOnce([heartbeatNode]);

    await scope.service.checkHealthHeartbeats();

    expect(scope.resourceHealthService.reportHealth).not.toHaveBeenCalled();
    expect(scope.service.getHeartbeatLastSeen(resourceId, '')).toBeInstanceOf(Date);
  });
}
