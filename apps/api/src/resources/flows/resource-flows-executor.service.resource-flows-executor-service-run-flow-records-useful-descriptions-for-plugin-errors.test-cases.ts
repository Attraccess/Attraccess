import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerPluginFlowNodes } from '../../plugin-system/plugin-flow-node-registry';
import { ResourceFlowsExecutorServiceRunFlowTestScope } from './resource-flows-executor.service.spec';
export function registerResourceFlowsExecutorServiceRunFlowRecordsUsefulDescriptionsForPluginErrors(
  scope: ResourceFlowsExecutorServiceRunFlowTestScope,
): void {
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
    const type = `plugin.error-shape.${scope.errorShapeIndex++}`;
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
    const input = scope.createNode({ id: 'input', type: ResourceFlowNodeType.INPUT_BUTTON });
    const output = scope.createNode({ id: 'output', type: type as ResourceFlowNodeType });
    scope.initialNodes = [input];
    scope.nodesById = { input, output };
    scope.edgesBySourceAndHandle['input|'] = [{ source: 'input', target: 'output' }];
    scope.flowLogs.start(1);
    await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {}).catch(() => undefined);
    const failure = scope.flowLogs
      .getLogs(1)
      .logs.find((log) => log.nodeId === 'output' && log.type === 'node.processing.failed');
    expect(JSON.parse(failure?.payload ?? '{}')).toMatchObject({ error: message, failureKind: 'node-failure' });
  });
}
