import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { ResourceFlowsExecutorServiceRunFlowTestScope } from './resource-flows-executor.service.spec';
export function registerResourceFlowsExecutorServiceRunFlowRecordsTheSameExecutionIdentityOnOperatingTransitionsAndFlowLogs(
  scope: ResourceFlowsExecutorServiceRunFlowTestScope,
): void {
  it('records the same execution identity on operating transitions and flow logs', async () => {
    const inputNode = scope.createNode({ id: 'operating-input', type: ResourceFlowNodeType.INPUT_BUTTON });
    const operatingNode = scope.createNode({
      id: 'operating-node',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_OPERATING,
    });
    scope.initialNodes = [inputNode];
    scope.nodesById = { [inputNode.id]: inputNode, [operatingNode.id]: operatingNode };
    scope.edgesBySourceAndHandle = {
      [`${inputNode.id}|`]: [{ source: inputNode.id, target: operatingNode.id }],
    };
    scope.flowLogs.start(1);

    await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {});

    const flowStart = scope.flowLogs.getLogs(1).logs.find((log) => log.type === 'flow.start');
    expect(flowStart.flowRunId).toEqual(expect.any(String));
    expect(scope.operatingIntervals.transition).toHaveBeenCalledWith(1, 'operating', {
      flowNodeId: 'operating-node',
      flowRunId: flowStart.flowRunId,
    });
  });
}
