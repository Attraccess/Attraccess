import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerHealthNodesScopeFixture } from './resource-flows-executor.service.health-nodes-06c314.test-fixture';
jest.mock('axios');
export function registerSetNodeSetsUnhealthyFromStaticConfigWithTemplatedReasonPart1Cases(
  fixture: ReturnType<typeof registerHealthNodesScopeFixture>,
) {
  it('SET node sets unhealthy from static config with templated reason', async () => {
    const resourceId = 12;
    const inputNode = fixture.fixture.createNode({
      id: 'in-set-1',
      type: ResourceFlowNodeType.INPUT_BUTTON,
      resourceId,
    });
    const setNode = fixture.fixture.createNode({
      id: 'set-1',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET,
      resourceId,
      data: { identifier: 'Internal', status: 'unhealthy', reason: 'temp={{temp}}' },
    });
    fixture.fixture.nodesById[inputNode.id] = inputNode;
    fixture.fixture.nodesById[setNode.id] = setNode;
    fixture.fixture.initialNodes = [inputNode];
    fixture.fixture.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: setNode.id }];
    fixture.fixture.edgesBySourceAndHandle[`${setNode.id}|`] = [];

    await fixture.fixture.service.runFlow(resourceId, ResourceFlowNodeType.INPUT_BUTTON, { temp: 91 });

    expect(fixture.fixture.resourceHealthService.reportHealth).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId,
        identifier: 'Internal',
        status: 'unhealthy',
        reason: 'temp=91',
        source: 'manual',
      }),
    );
  });
}
