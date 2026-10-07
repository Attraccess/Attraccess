import { registerPluginFlowNodes } from '../../plugin-system/plugin-flow-node-registry';
import { ResourceFlowsExecutorServiceRunFlowTestScope } from './resource-flows-executor.service.spec';
export function registerResourceFlowsExecutorServiceRunFlowRejectsAPluginAttemptingToTriggerANodeOwnedByAnotherPlugin(
  scope: ResourceFlowsExecutorServiceRunFlowTestScope,
): void {
  it('rejects a plugin attempting to trigger a node owned by another plugin', async () => {
    registerPluginFlowNodes('owner-plugin', [
      {
        type: 'plugin.owner-test.trigger',
        label: 'Owner test trigger',
        configSchema: {},
        inputs: [],
        outputs: ['output'],
        isInput: true,
      },
    ]);

    await expect(
      scope.service.triggerPluginFlows('other-plugin', 'plugin.owner-test.trigger', () => true, {}),
    ).rejects.toThrow(/not a registered trigger node/);
  });
}
