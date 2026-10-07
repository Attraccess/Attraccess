import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerResourceFlowsExecutorServiceRunFlowFixture } from './resource-flows-executor.service.resource-flows-executor-service-run-flow.test-fixture';

jest.mock('axios');
export function registerRoutesAMeteringStartAndCollectionBranchToTheReplyChannelOfItsOperationCases(
  fixture: ReturnType<typeof registerResourceFlowsExecutorServiceRunFlowFixture>,
) {
  it('routes a metering start and collection branch to the reply channel of its operation', async () => {
    const start = fixture.createNode({ id: 'start', type: ResourceFlowNodeType.INPUT_METERING_START });
    const ready = fixture.createNode({
      id: 'ready',
      type: ResourceFlowNodeType.OUTPUT_METERING_READY,
      data: { source: 'shelly' },
    });
    const collect = fixture.createNode({ id: 'collect', type: ResourceFlowNodeType.INPUT_METERING_COLLECT });
    const report = fixture.createNode({
      id: 'report',
      type: ResourceFlowNodeType.OUTPUT_METERING_REPORT,
      data: { value: '{{reading.wh}}', unit: 'Wh' },
    });
    fixture.nodesById = { start, ready, collect, report };
    fixture.edgesBySourceAndHandle = {
      'start|': [{ source: 'start', target: 'ready' }],
      'collect|': [{ source: 'collect', target: 'report' }],
    };
    const complete = jest.fn().mockResolvedValue(undefined);

    fixture.initialNodes = [start];
    await fixture.service.runFlow(1, ResourceFlowNodeType.INPUT_METERING_START, {}, undefined, {
      metering: { operationId: 'op-1', kind: 'start', complete },
    });
    expect(complete).toHaveBeenLastCalledWith({ kind: 'ready', baseline: undefined, source: 'shelly' });

    fixture.initialNodes = [collect];
    await fixture.service.runFlow(
      1,
      ResourceFlowNodeType.INPUT_METERING_COLLECT,
      { reading: { wh: 1500 } },
      undefined,
      {
        metering: { operationId: 'op-2', kind: 'final', complete },
      },
    );
    expect(complete).toHaveBeenLastCalledWith({
      kind: 'reading',
      value: '1500',
      unit: 'Wh',
      observedAt: undefined,
      source: undefined,
    });
  });
}
