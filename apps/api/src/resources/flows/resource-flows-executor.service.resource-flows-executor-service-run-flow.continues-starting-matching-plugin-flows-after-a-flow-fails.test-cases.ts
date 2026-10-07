import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerPluginFlowNodes } from '../../plugin-system/plugin-flow-node-registry';
import { registerResourceFlowsExecutorServiceRunFlowFixture } from './resource-flows-executor.service.resource-flows-executor-service-run-flow.test-fixture';

jest.mock('axios');
export function registerContinuesStartingMatchingPluginFlowsAfterAFlowFailsCases(
  fixture: ReturnType<typeof registerResourceFlowsExecutorServiceRunFlowFixture>,
) {
  it('continues starting matching plugin flows after a flow fails', async () => {
    registerPluginFlowNodes('failure-test', [
      {
        type: 'plugin.failure-test.trigger',
        label: 'Failure test trigger',
        configSchema: {},
        inputs: [],
        outputs: ['output'],
        isInput: true,
      },
    ]);
    fixture.initialNodes = [
      fixture.createNode({ id: 'first', type: 'plugin.failure-test.trigger' as ResourceFlowNodeType }),
      fixture.createNode({ id: 'second', type: 'plugin.failure-test.trigger' as ResourceFlowNodeType }),
    ];
    jest.spyOn(fixture.service, 'startFlow').mockRejectedValueOnce(new Error('flow failed')).mockResolvedValueOnce([]);

    await fixture.service.triggerPluginFlows('failure-test', 'plugin.failure-test.trigger', () => true, {});

    expect(fixture.service.startFlow).toHaveBeenCalledTimes(2);
  });
}
