import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerResourceFlowsExecutorServiceRunFlowFixture } from './resource-flows-executor.service.resource-flows-executor-service-run-flow.test-fixture';

jest.mock('axios');
export function registerPropagatesExplicitTerminationFailuresFromTheSLifecycleFlowCases(
  fixture: ReturnType<typeof registerResourceFlowsExecutorServiceRunFlowFixture>,
) {
  it.each([
    ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
    ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
    ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER,
  ])('propagates explicit termination failures from the %s lifecycle flow', async (triggerNodeType) => {
    const inputNode = fixture.createNode({ id: 'in-1', type: triggerNodeType });
    const endNode = fixture.createNode({
      id: 'end-1',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_USAGE_END_SESSION,
      data: { failureBehavior: 'fail-flow' },
    });
    fixture.nodesById[inputNode.id] = inputNode;
    fixture.nodesById[endNode.id] = endNode;
    fixture.initialNodes = [inputNode];
    fixture.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: endNode.id }];
    fixture.edgesBySourceAndHandle[`${endNode.id}|`] = [];

    (fixture.resourceUsageService.getActiveSession as jest.Mock).mockResolvedValue(null);

    await expect(fixture.service.runFlow(1, triggerNodeType, {})).rejects.toMatchObject({
      message: 'NO_USAGE_SESSION',
      failureKind: 'node-failure',
      status: 503,
    });
  });
}
