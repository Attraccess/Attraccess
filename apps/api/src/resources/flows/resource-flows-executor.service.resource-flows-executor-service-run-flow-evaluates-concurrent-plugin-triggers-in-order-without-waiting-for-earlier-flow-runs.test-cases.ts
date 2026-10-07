import { NodeProcessingResult } from './node-executors';
import { ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerPluginFlowNodes } from '../../plugin-system/plugin-flow-node-registry';
import { ResourceFlowsExecutorServiceRunFlowTestScope } from './resource-flows-executor.service.spec';
export function registerResourceFlowsExecutorServiceRunFlowEvaluatesConcurrentPluginTriggersInOrderWithoutWaitingForEarlierFlowRuns(
  scope: ResourceFlowsExecutorServiceRunFlowTestScope,
): void {
  it('evaluates concurrent plugin triggers in order without waiting for earlier flow runs', async () => {
    registerPluginFlowNodes('ordering-test', [
      {
        type: 'plugin.ordering-test.trigger',
        label: 'Ordering test trigger',
        configSchema: {},
        inputs: [],
        outputs: ['output'],
        isInput: true,
      },
    ]);
    const node = scope.createNode({ id: 'trigger', type: 'plugin.ordering-test.trigger' as ResourceFlowNodeType });
    let resolveFirstLookup!: (nodes: ResourceFlowNode[]) => void;
    const firstLookup = new Promise<ResourceFlowNode[]>((resolve) => {
      resolveFirstLookup = resolve;
    });
    (scope.flowNodeRepository.find as jest.Mock).mockImplementationOnce(() => firstLookup).mockResolvedValue([node]);
    let releaseFirstFlow!: () => void;
    const firstFlow = new Promise<NodeProcessingResult[]>((resolve) => {
      releaseFirstFlow = () => resolve([]);
    });
    jest
      .spyOn(scope.service, 'startFlow')
      .mockImplementationOnce(() => firstFlow)
      .mockResolvedValueOnce([]);
    const matched: string[] = [];

    const first = scope.service.triggerPluginFlows(
      'ordering-test',
      'plugin.ordering-test.trigger',
      () => {
        matched.push('first');
        return true;
      },
      {},
    );
    const second = scope.service.triggerPluginFlows(
      'ordering-test',
      'plugin.ordering-test.trigger',
      () => {
        matched.push('second');
        return true;
      },
      {},
    );

    await Promise.resolve();
    expect(scope.flowNodeRepository.find).toHaveBeenCalledTimes(1);
    resolveFirstLookup([node]);
    await new Promise((resolve) => setImmediate(resolve));

    expect(matched).toEqual(['first', 'second']);
    expect(scope.service.startFlow).toHaveBeenCalledTimes(2);
    releaseFirstFlow();
    await Promise.all([first, second]);
  });
}
