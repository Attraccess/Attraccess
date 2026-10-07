import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerHealthNodesScopeFixture } from './resource-flows-executor.service.health-nodes-06c314.test-fixture';
jest.mock('axios');
export function registerSetNodePayloadHealthStatusOverridesStaticStatusAndSwitchPart3Cases(
  fixture: ReturnType<typeof registerHealthNodesScopeFixture>,
) {
  it('SET node payload health.status overrides static status and switches source to payload', async () => {
    const resourceId = 14;
    const inputNode = fixture.fixture.createNode({
      id: 'in-set-ovs',
      type: ResourceFlowNodeType.INPUT_BUTTON,
      resourceId,
    });
    const setNode = fixture.fixture.createNode({
      id: 'set-ovs',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET,
      resourceId,
      data: { identifier: 'ir-bridge', status: 'healthy', reason: 'fallback' },
    });
    fixture.fixture.nodesById[inputNode.id] = inputNode;
    fixture.fixture.nodesById[setNode.id] = setNode;
    fixture.fixture.initialNodes = [inputNode];
    fixture.fixture.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: setNode.id }];
    fixture.fixture.edgesBySourceAndHandle[`${setNode.id}|`] = [];

    await fixture.fixture.service.runFlow(resourceId, ResourceFlowNodeType.INPUT_BUTTON, {
      health: { status: 'unhealthy', reason: 'lost wifi' },
    });

    expect(fixture.fixture.resourceHealthService.reportHealth).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId,
        identifier: 'ir-bridge',
        status: 'unhealthy',
        reason: 'lost wifi',
        source: 'payload',
      }),
    );
  });
}
