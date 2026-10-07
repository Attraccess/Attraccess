import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerPluginFlowNodes } from '../../plugin-system/plugin-flow-node-registry';
import { ResourceFlowsExecutorServiceRunFlowTestScope } from './resource-flows-executor.service.spec';
export function registerResourceFlowsExecutorServiceRunFlowRejectsAPluginTriggerTypeThatCollidesWithABuiltInFlowNode(
  scope: ResourceFlowsExecutorServiceRunFlowTestScope,
): void {
  it('rejects a plugin trigger type that collides with a built-in flow node', async () => {
    registerPluginFlowNodes('colliding-plugin', [
      {
        type: ResourceFlowNodeType.INPUT_BUTTON,
        label: 'Colliding trigger',
        configSchema: {},
        inputs: [],
        outputs: ['output'],
        isInput: true,
      },
    ]);

    await expect(
      scope.service.triggerPluginFlows('colliding-plugin', ResourceFlowNodeType.INPUT_BUTTON, () => true, {}),
    ).rejects.toThrow(/not a registered trigger node/);
  });
}
