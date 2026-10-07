import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerHealthNodesScopeFixture } from './resource-flows-executor.service.health-nodes-06c314.test-fixture';
jest.mock('axios');
export function registerDoesNotTriggerHeartbeatUnhealthyWhenWithinTimeoutPart8Cases(
  fixture: ReturnType<typeof registerHealthNodesScopeFixture>,
) {
  it('does not trigger heartbeat unhealthy when within timeout', async () => {
    const resourceId = 19;
    const heartbeatNode = fixture.fixture.createNode({
      id: 'hb-fresh',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT,
      resourceId,
      data: { identifier: '', timeoutSeconds: 60, unhealthyReason: '' },
    });

    (fixture.fixture.flowNodeRepository.find as jest.Mock).mockResolvedValueOnce([heartbeatNode]);

    const heartbeatLastSeen = (fixture.fixture.service as unknown as { heartbeatLastSeen: Map<string, Date> })
      .heartbeatLastSeen;
    heartbeatLastSeen.set(`${resourceId}::`, new Date(Date.now() - 10 * 1000));

    await fixture.fixture.service.checkHealthHeartbeats();

    expect(fixture.fixture.resourceHealthService.reportHealth).not.toHaveBeenCalled();
  });
}
