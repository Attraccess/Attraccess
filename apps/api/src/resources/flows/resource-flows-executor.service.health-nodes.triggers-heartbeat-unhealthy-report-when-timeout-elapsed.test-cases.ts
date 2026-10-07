import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerHealthNodesScopeFixture } from './resource-flows-executor.service.health-nodes-06c314.test-fixture';
jest.mock('axios');
export function registerTriggersHeartbeatUnhealthyReportWhenTimeoutElapsedPart7Cases(
  fixture: ReturnType<typeof registerHealthNodesScopeFixture>,
) {
  it('triggers heartbeat unhealthy report when timeout elapsed', async () => {
    const resourceId = 18;
    const heartbeatNode = fixture.fixture.createNode({
      id: 'hb-timeout',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT,
      resourceId,
      data: { identifier: 'ir-bridge', timeoutSeconds: 60, unhealthyReason: 'no signal' },
    });

    (fixture.fixture.flowNodeRepository.find as jest.Mock).mockResolvedValueOnce([heartbeatNode]);

    const heartbeatLastSeen = (fixture.fixture.service as unknown as { heartbeatLastSeen: Map<string, Date> })
      .heartbeatLastSeen;
    heartbeatLastSeen.set(`${resourceId}::ir-bridge`, new Date(Date.now() - 5 * 60 * 1000));

    await fixture.fixture.service.checkHealthHeartbeats();

    expect(fixture.fixture.resourceHealthService.reportHealth).toHaveBeenCalledWith(
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
