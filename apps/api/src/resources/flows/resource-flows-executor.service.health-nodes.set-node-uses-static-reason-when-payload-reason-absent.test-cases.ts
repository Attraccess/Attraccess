import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerHealthNodesScopeFixture } from './resource-flows-executor.service.health-nodes-06c314.test-fixture';
jest.mock('axios');
export function registerSetNodeUsesStaticReasonWhenPayloadReasonAbsentPart5Cases(
  fixture: ReturnType<typeof registerHealthNodesScopeFixture>,
) {
  it('SET node uses static reason when payload reason absent', async () => {
    const resourceId = 16;
    const inputNode = fixture.fixture.createNode({
      id: 'in-set-sr',
      type: ResourceFlowNodeType.INPUT_BUTTON,
      resourceId,
    });
    const setNode = fixture.fixture.createNode({
      id: 'set-sr',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET,
      resourceId,
      data: { identifier: '', status: 'unhealthy', reason: 'static fallback' },
    });
    fixture.fixture.nodesById[inputNode.id] = inputNode;
    fixture.fixture.nodesById[setNode.id] = setNode;
    fixture.fixture.initialNodes = [inputNode];
    fixture.fixture.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: setNode.id }];
    fixture.fixture.edgesBySourceAndHandle[`${setNode.id}|`] = [];

    await fixture.fixture.service.runFlow(resourceId, ResourceFlowNodeType.INPUT_BUTTON, {});

    expect(fixture.fixture.resourceHealthService.reportHealth).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'unhealthy',
        reason: 'static fallback',
        source: 'manual',
      }),
    );
  });
}
