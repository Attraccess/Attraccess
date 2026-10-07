import { registerPluginFlowNodes } from '../../plugin-system/plugin-flow-node-registry';
import { registerResourceFlowsExecutorServiceRunFlowFixture } from './resource-flows-executor.service.resource-flows-executor-service-run-flow.test-fixture';

jest.mock('axios');
export function registerRejectsAPluginAttemptingToTriggerANodeOwnedByAnotherPluginCases(
  fixture: ReturnType<typeof registerResourceFlowsExecutorServiceRunFlowFixture>,
) {
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
      fixture.service.triggerPluginFlows('other-plugin', 'plugin.owner-test.trigger', () => true, {}),
    ).rejects.toThrow(/not a registered trigger node/);
  });
}
