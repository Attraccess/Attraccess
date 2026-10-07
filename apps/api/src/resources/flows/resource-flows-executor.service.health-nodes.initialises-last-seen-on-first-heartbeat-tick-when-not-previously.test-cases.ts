import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerHealthNodesScopeFixture } from './resource-flows-executor.service.health-nodes-06c314.test-fixture';
jest.mock('axios');
export function registerInitialisesLastSeenOnFirstHeartbeatTickWhenNotPreviouslyPart9Cases(
  fixture: ReturnType<typeof registerHealthNodesScopeFixture>,
) {
  it('initialises last-seen on first heartbeat tick when not previously set', async () => {
    const resourceId = 20;
    const heartbeatNode = fixture.fixture.createNode({
      id: 'hb-firsttick',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT,
      resourceId,
      data: { identifier: '', timeoutSeconds: 60, unhealthyReason: '' },
    });

    (fixture.fixture.flowNodeRepository.find as jest.Mock).mockResolvedValueOnce([heartbeatNode]);

    await fixture.fixture.service.checkHealthHeartbeats();

    expect(fixture.fixture.resourceHealthService.reportHealth).not.toHaveBeenCalled();
    expect(fixture.fixture.service.getHeartbeatLastSeen(resourceId, '')).toBeInstanceOf(Date);
  });
}
