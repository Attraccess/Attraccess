import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { ResourceFlowsExecutorServiceRunFlowTestScope } from './resource-flows-executor.service.spec';
export function registerResourceFlowsExecutorServiceRunFlowPropagatesExplicitTerminationFailuresFromTheSLifecycleFlow(
  scope: ResourceFlowsExecutorServiceRunFlowTestScope,
): void {
  it.each([
    ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
    ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
    ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER,
  ])('propagates explicit termination failures from the %s lifecycle flow', async (triggerNodeType) => {
    const inputNode = scope.createNode({ id: 'in-1', type: triggerNodeType });
    const endNode = scope.createNode({
      id: 'end-1',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_USAGE_END_SESSION,
      data: { failureBehavior: 'fail-flow' },
    });
    scope.nodesById[inputNode.id] = inputNode;
    scope.nodesById[endNode.id] = endNode;
    scope.initialNodes = [inputNode];
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: endNode.id }];
    scope.edgesBySourceAndHandle[`${endNode.id}|`] = [];

    (scope.resourceUsageService.getActiveSession as jest.Mock).mockResolvedValue(null);

    await expect(scope.service.runFlow(1, triggerNodeType, {})).rejects.toMatchObject({
      message: 'NO_USAGE_SESSION',
      failureKind: 'node-failure',
      status: 503,
    });
  });
}
