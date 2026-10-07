import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerPluginFlowNodes } from '../../plugin-system/plugin-flow-node-registry';
import { registerResourceFlowsExecutorServiceRunFlowFixture } from './resource-flows-executor.service.resource-flows-executor-service-run-flow.test-fixture';

jest.mock('axios');
export function registerStartsEveryMatchingPluginTriggerWhileIsolatingMatcherFailuresCases(
  fixture: ReturnType<typeof registerResourceFlowsExecutorServiceRunFlowFixture>,
) {
  it('starts every matching plugin trigger while isolating matcher failures', async () => {
    registerPluginFlowNodes('executor-test', [
      {
        type: 'plugin.executor-test.trigger',
        label: 'Executor test trigger',
        configSchema: {},
        inputs: [],
        outputs: ['output'],
        isInput: true,
      },
    ]);
    fixture.initialNodes = [
      fixture.createNode({
        id: 'matching',
        type: 'plugin.executor-test.trigger' as ResourceFlowNodeType,
        resourceId: 1,
        data: { match: true },
      }),
      fixture.createNode({
        id: 'throws',
        type: 'plugin.executor-test.trigger' as ResourceFlowNodeType,
        resourceId: 2,
        data: { throws: true },
      }),
      fixture.createNode({
        id: 'skipped',
        type: 'plugin.executor-test.trigger' as ResourceFlowNodeType,
        resourceId: 3,
        data: { match: false },
      }),
    ];

    await fixture.service.triggerPluginFlows(
      'executor-test',
      'plugin.executor-test.trigger',
      (config) => {
        if (config.throws) throw new Error('bad config');
        return config.match === true;
      },
      { source: 'plugin' },
    );

    expect(fixture.flowEdgeRepository.find as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ source: 'matching' }) }),
    );
    expect(fixture.flowEdgeRepository.find as jest.Mock).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ source: 'throws' }) }),
    );
  });
}
