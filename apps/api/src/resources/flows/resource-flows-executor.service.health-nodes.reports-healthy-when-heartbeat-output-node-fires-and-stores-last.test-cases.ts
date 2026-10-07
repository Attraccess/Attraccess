import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerHealthNodesScopeFixture } from './resource-flows-executor.service.health-nodes-06c314.test-fixture';
jest.mock('axios');
export function registerReportsHealthyWhenHeartbeatOutputNodeFiresAndStoresLastCases(
  fixture: ReturnType<typeof registerHealthNodesScopeFixture>,
) {
  it('reports healthy when heartbeat output node fires and stores last seen timestamp', async () => {
    const resourceId = 11;
    const inputNode = fixture.fixture.createNode({ id: 'in-hb', type: ResourceFlowNodeType.INPUT_BUTTON, resourceId });
    const heartbeatNode = fixture.fixture.createNode({
      id: 'heartbeat-1',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT,
      resourceId,
      data: { identifier: 'ir-bridge', timeoutSeconds: 60, unhealthyReason: 'no signal' },
    });
    fixture.fixture.nodesById[inputNode.id] = inputNode;
    fixture.fixture.nodesById[heartbeatNode.id] = heartbeatNode;
    fixture.fixture.initialNodes = [inputNode];
    fixture.fixture.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: heartbeatNode.id }];
    fixture.fixture.edgesBySourceAndHandle[`${heartbeatNode.id}|`] = [];

    await fixture.fixture.service.runFlow(resourceId, ResourceFlowNodeType.INPUT_BUTTON, {});

    expect(fixture.fixture.resourceHealthService.reportHealth).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId,
        identifier: 'ir-bridge',
        status: 'healthy',
        source: 'heartbeat',
      }),
    );

    const lastSeen = fixture.fixture.service.getHeartbeatLastSeen(resourceId, 'ir-bridge');
    expect(lastSeen).toBeInstanceOf(Date);
  });
}
