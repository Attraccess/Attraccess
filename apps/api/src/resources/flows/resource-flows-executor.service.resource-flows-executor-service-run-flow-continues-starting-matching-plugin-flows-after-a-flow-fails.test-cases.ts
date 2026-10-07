import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerPluginFlowNodes } from '../../plugin-system/plugin-flow-node-registry';
import { ResourceFlowsExecutorServiceRunFlowTestScope } from './resource-flows-executor.service.spec';
export function registerResourceFlowsExecutorServiceRunFlowContinuesStartingMatchingPluginFlowsAfterAFlowFails(
  scope: ResourceFlowsExecutorServiceRunFlowTestScope,
): void {
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
    scope.initialNodes = [
      scope.createNode({ id: 'first', type: 'plugin.failure-test.trigger' as ResourceFlowNodeType }),
      scope.createNode({ id: 'second', type: 'plugin.failure-test.trigger' as ResourceFlowNodeType }),
    ];
    jest.spyOn(scope.service, 'startFlow').mockRejectedValueOnce(new Error('flow failed')).mockResolvedValueOnce([]);

    await scope.service.triggerPluginFlows('failure-test', 'plugin.failure-test.trigger', () => true, {});

    expect(scope.service.startFlow).toHaveBeenCalledTimes(2);
  });
}
