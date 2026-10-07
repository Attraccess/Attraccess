import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerHealthNodesScopeFixture } from './resource-flows-executor.service.health-nodes-06c314.test-fixture';
jest.mock('axios');
export function registerSetNodePayloadHealthIdentifierOverridesStaticIdentifierPart4Cases(
  fixture: ReturnType<typeof registerHealthNodesScopeFixture>,
) {
  it('SET node payload health.identifier overrides static identifier', async () => {
    const resourceId = 15;
    const inputNode = fixture.fixture.createNode({
      id: 'in-set-id',
      type: ResourceFlowNodeType.INPUT_BUTTON,
      resourceId,
    });
    const setNode = fixture.fixture.createNode({
      id: 'set-id',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET,
      resourceId,
      data: { identifier: 'StaticId', status: 'unhealthy', reason: 'static reason' },
    });
    fixture.fixture.nodesById[inputNode.id] = inputNode;
    fixture.fixture.nodesById[setNode.id] = setNode;
    fixture.fixture.initialNodes = [inputNode];
    fixture.fixture.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: setNode.id }];
    fixture.fixture.edgesBySourceAndHandle[`${setNode.id}|`] = [];

    await fixture.fixture.service.runFlow(resourceId, ResourceFlowNodeType.INPUT_BUTTON, {
      health: { identifier: 'PayloadId' },
    });

    expect(fixture.fixture.resourceHealthService.reportHealth).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'PayloadId',
        status: 'unhealthy',
      }),
    );
  });
}
