import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerResourceFlowsExecutorServiceRunFlowFixture } from './resource-flows-executor.service.resource-flows-executor-service-run-flow.test-fixture';

jest.mock('axios');
export function registerRecordsTheSameExecutionIdentityOnOperatingTransitionsAndFlowLogsCases(
  fixture: ReturnType<typeof registerResourceFlowsExecutorServiceRunFlowFixture>,
) {
  it('records the same execution identity on operating transitions and flow logs', async () => {
    const inputNode = fixture.createNode({ id: 'operating-input', type: ResourceFlowNodeType.INPUT_BUTTON });
    const operatingNode = fixture.createNode({
      id: 'operating-node',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_OPERATING,
    });
    fixture.initialNodes = [inputNode];
    fixture.nodesById = { [inputNode.id]: inputNode, [operatingNode.id]: operatingNode };
    fixture.edgesBySourceAndHandle = {
      [`${inputNode.id}|`]: [{ source: inputNode.id, target: operatingNode.id }],
    };
    fixture.flowLogs.start(1);

    await fixture.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {});

    const flowStart = fixture.flowLogs.getLogs(1).logs.find((log) => log.type === 'flow.start');
    expect(flowStart.flowRunId).toEqual(expect.any(String));
    expect(fixture.operatingIntervals.transition).toHaveBeenCalledWith(1, 'operating', {
      flowNodeId: 'operating-node',
      flowRunId: flowStart.flowRunId,
    });
  });
}
