import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerHealthNodesScopeFixture } from './resource-flows-executor.service.health-nodes-06c314.test-fixture';
jest.mock('axios');
export function registerUsesDefaultReasonWhenUnhealthyreasonIsBlankOnHeartbeatTiPart10Cases(
  fixture: ReturnType<typeof registerHealthNodesScopeFixture>,
) {
  it('uses default reason when unhealthyReason is blank on heartbeat timeout', async () => {
    const resourceId = 21;
    const heartbeatNode = fixture.fixture.createNode({
      id: 'hb-default-reason',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT,
      resourceId,
      data: { identifier: '', timeoutSeconds: 30, unhealthyReason: '' },
    });

    (fixture.fixture.flowNodeRepository.find as jest.Mock).mockResolvedValueOnce([heartbeatNode]);

    const heartbeatLastSeen = (fixture.fixture.service as unknown as { heartbeatLastSeen: Map<string, Date> })
      .heartbeatLastSeen;
    heartbeatLastSeen.set(`${resourceId}::`, new Date(Date.now() - 5 * 60 * 1000));

    await fixture.fixture.service.checkHealthHeartbeats();

    expect(fixture.fixture.resourceHealthService.reportHealth).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'Heartbeat timed out',
      }),
    );
  });
}
