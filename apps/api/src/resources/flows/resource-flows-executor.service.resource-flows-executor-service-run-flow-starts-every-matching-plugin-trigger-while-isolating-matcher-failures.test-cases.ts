import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerPluginFlowNodes } from '../../plugin-system/plugin-flow-node-registry';
import { ResourceFlowsExecutorServiceRunFlowTestScope } from './resource-flows-executor.service.spec';
export function registerResourceFlowsExecutorServiceRunFlowStartsEveryMatchingPluginTriggerWhileIsolatingMatcherFailures(
  scope: ResourceFlowsExecutorServiceRunFlowTestScope,
): void {
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
    scope.initialNodes = [
      scope.createNode({
        id: 'matching',
        type: 'plugin.executor-test.trigger' as ResourceFlowNodeType,
        resourceId: 1,
        data: { match: true },
      }),
      scope.createNode({
        id: 'throws',
        type: 'plugin.executor-test.trigger' as ResourceFlowNodeType,
        resourceId: 2,
        data: { throws: true },
      }),
      scope.createNode({
        id: 'skipped',
        type: 'plugin.executor-test.trigger' as ResourceFlowNodeType,
        resourceId: 3,
        data: { match: false },
      }),
    ];

    await scope.service.triggerPluginFlows(
      'executor-test',
      'plugin.executor-test.trigger',
      (config) => {
        if (config.throws) throw new Error('bad config');
        return config.match === true;
      },
      { source: 'plugin' },
    );

    expect(scope.flowEdgeRepository.find as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ source: 'matching' }) }),
    );
    expect(scope.flowEdgeRepository.find as jest.Mock).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ source: 'throws' }) }),
    );
  });
}
