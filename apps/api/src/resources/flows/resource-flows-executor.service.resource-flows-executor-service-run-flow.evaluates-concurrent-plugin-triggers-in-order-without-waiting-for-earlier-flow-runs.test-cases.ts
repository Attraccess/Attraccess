import type { NodeProcessingResult } from './node-executors';
import { ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerPluginFlowNodes } from '../../plugin-system/plugin-flow-node-registry';
import { registerResourceFlowsExecutorServiceRunFlowFixture } from './resource-flows-executor.service.resource-flows-executor-service-run-flow.test-fixture';

jest.mock('axios');
export function registerEvaluatesConcurrentPluginTriggersInOrderWithoutWaitingForEarlierFlowRunsCases(
  fixture: ReturnType<typeof registerResourceFlowsExecutorServiceRunFlowFixture>,
) {
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
    const node = fixture.createNode({ id: 'trigger', type: 'plugin.ordering-test.trigger' as ResourceFlowNodeType });
    let resolveFirstLookup!: (nodes: ResourceFlowNode[]) => void;
    const firstLookup = new Promise<ResourceFlowNode[]>((resolve) => {
      resolveFirstLookup = resolve;
    });
    (fixture.flowNodeRepository.find as jest.Mock).mockImplementationOnce(() => firstLookup).mockResolvedValue([node]);
    let releaseFirstFlow!: () => void;
    const firstFlow = new Promise<NodeProcessingResult[]>((resolve) => {
      releaseFirstFlow = () => resolve([]);
    });
    jest
      .spyOn(fixture.service, 'startFlow')
      .mockImplementationOnce(() => firstFlow)
      .mockResolvedValueOnce([]);
    const matched: string[] = [];

    const first = fixture.service.triggerPluginFlows(
      'ordering-test',
      'plugin.ordering-test.trigger',
      () => {
        matched.push('first');
        return true;
      },
      {},
    );
    const second = fixture.service.triggerPluginFlows(
      'ordering-test',
      'plugin.ordering-test.trigger',
      () => {
        matched.push('second');
        return true;
      },
      {},
    );

    await Promise.resolve();
    expect(fixture.flowNodeRepository.find).toHaveBeenCalledTimes(1);
    resolveFirstLookup([node]);
    await new Promise((resolve) => setImmediate(resolve));

    expect(matched).toEqual(['first', 'second']);
    expect(fixture.service.startFlow).toHaveBeenCalledTimes(2);
    releaseFirstFlow();
    await Promise.all([first, second]);
  });
}
