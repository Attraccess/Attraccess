import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerHealthNodesScopeFixture } from './resource-flows-executor.service.health-nodes-06c314.test-fixture';
jest.mock('axios');
export function registerSetNodeThrowsOnInvalidPayloadStatusPart6Cases(
  fixture: ReturnType<typeof registerHealthNodesScopeFixture>,
) {
  it('SET node throws on invalid payload status', async () => {
    const resourceId = 17;
    const inputNode = fixture.fixture.createNode({
      id: 'in-set-bad',
      type: ResourceFlowNodeType.INPUT_BUTTON,
      resourceId,
    });
    const setNode = fixture.fixture.createNode({
      id: 'set-bad',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET,
      resourceId,
      data: { identifier: '', status: 'healthy', reason: '' },
    });
    fixture.fixture.nodesById[inputNode.id] = inputNode;
    fixture.fixture.nodesById[setNode.id] = setNode;
    fixture.fixture.initialNodes = [inputNode];
    fixture.fixture.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: setNode.id }];
    fixture.fixture.edgesBySourceAndHandle[`${setNode.id}|`] = [];

    await expect(
      fixture.fixture.service.runFlow(resourceId, ResourceFlowNodeType.INPUT_BUTTON, {
        health: { status: 'maybe' },
      }),
    ).rejects.toThrow(/expected "healthy" or "unhealthy"/);
  });
}
