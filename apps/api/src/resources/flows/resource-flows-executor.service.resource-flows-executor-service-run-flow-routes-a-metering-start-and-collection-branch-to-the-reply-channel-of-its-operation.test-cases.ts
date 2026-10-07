import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { ResourceFlowsExecutorServiceRunFlowTestScope } from './resource-flows-executor.service.spec';
export function registerResourceFlowsExecutorServiceRunFlowRoutesAMeteringStartAndCollectionBranchToTheReplyChannelOfItsOperation(
  scope: ResourceFlowsExecutorServiceRunFlowTestScope,
): void {
  it('routes a metering start and collection branch to the reply channel of its operation', async () => {
    const start = scope.createNode({
      id: 'start',
      type: ResourceFlowNodeType.INPUT_METERING_START,
      data: { meterId: 1 },
    });
    const ready = scope.createNode({
      id: 'ready',
      type: ResourceFlowNodeType.OUTPUT_METERING_READY,
      data: { meterId: 1, source: 'shelly' },
    });
    const collect = scope.createNode({
      id: 'collect',
      type: ResourceFlowNodeType.INPUT_METERING_COLLECT,
      data: { meterId: 1 },
    });
    const report = scope.createNode({
      id: 'report',
      type: ResourceFlowNodeType.OUTPUT_METERING_REPORT,
      data: { meterId: 1, value: '{{scaleDecimal reading.wh "1/1000"}}' },
    });
    scope.nodesById = { start, ready, collect, report };
    scope.edgesBySourceAndHandle = {
      'start|': [{ source: 'start', target: 'ready' }],
      'collect|': [{ source: 'collect', target: 'report' }],
    };
    const complete = jest.fn().mockResolvedValue(undefined);

    scope.initialNodes = [start];
    await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_METERING_START, {}, undefined, {
      metering: { meterId: 1, operationId: 'op-1', kind: 'start', complete },
    });
    expect(complete).toHaveBeenLastCalledWith({ kind: 'ready', baseline: undefined, source: 'shelly' });

    scope.initialNodes = [collect];
    await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_METERING_COLLECT, { reading: { wh: 1500 } }, undefined, {
      metering: { meterId: 1, operationId: 'op-2', kind: 'final', complete },
    });
    expect(complete).toHaveBeenLastCalledWith({
      kind: 'reading',
      mode: 'total',
      value: '1.5',
      observedAt: undefined,
      source: undefined,
    });
  });
}
