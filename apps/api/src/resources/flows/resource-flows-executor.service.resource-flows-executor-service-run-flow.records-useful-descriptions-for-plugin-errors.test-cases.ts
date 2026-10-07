import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerPluginFlowNodes } from '../../plugin-system/plugin-flow-node-registry';
import { registerResourceFlowsExecutorServiceRunFlowFixture } from './resource-flows-executor.service.resource-flows-executor-service-run-flow.test-fixture';

jest.mock('axios');
export function registerRecordsUsefulDescriptionsForPluginErrorsCases(
  fixture: ReturnType<typeof registerResourceFlowsExecutorServiceRunFlowFixture>,
) {
  it.each([
    [new Error(''), 'Error'],
    ['failure text', 'failure text'],
    ['', 'Unknown error'],
    [{ message: 'remote error' }, 'remote error'],
    [{ message: '' }, 'Unknown error'],
    [null, 'null'],
    [{}, 'Unknown error'],
    [undefined, 'Unknown error'],
    [42, '42'],
  ])('records useful descriptions for plugin errors: %#', async (error, message) => {
    const type = `plugin.error-shape.${fixture.errorShapeIndex++}`;
    registerPluginFlowNodes('error-shape', [
      {
        type,
        label: 'Error shape',
        configSchema: {},
        inputs: ['input'],
        outputs: ['output'],
        execute: async () => {
          throw error;
        },
      },
    ]);
    const input = fixture.createNode({ id: 'input', type: ResourceFlowNodeType.INPUT_BUTTON });
    const output = fixture.createNode({ id: 'output', type: type as ResourceFlowNodeType });
    fixture.initialNodes = [input];
    fixture.nodesById = { input, output };
    fixture.edgesBySourceAndHandle['input|'] = [{ source: 'input', target: 'output' }];
    fixture.flowLogs.start(1);
    await fixture.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {}).catch(() => undefined);
    const failure = fixture.flowLogs
      .getLogs(1)
      .logs.find((log) => log.nodeId === 'output' && log.type === 'node.processing.failed');
    expect(JSON.parse(failure?.payload ?? '{}')).toMatchObject({ error: message, failureKind: 'node-failure' });
  });
}
