import { ResourceFlowNodeType, ResourceType, ResourceUsageAction, UsageSession } from '@attraccess/application-models';

import type { PluginFlowFailureBehavior, PluginFlowNodeDefinition } from '@attraccess/plugins-backend-sdk';

import { registerPluginFlowNodes } from '../../../plugin-system/flows/node-registry';

import { ResourceSessionStartedEvent } from '../../usage/events/resource-usage.events';

import { ExternalEffectFailureError } from '../errors/external-effect-failure.error';

import { createNode } from './fixtures/node.test-fixture';

import { resetTestFixture } from './fixtures/setup.test-fixture';

import type { FlowExecutionTestScope } from './fixtures/flow-test-scope.test-fixture';

class DeviceFaultError extends Error {}

let typeIndex = 0;

/** Registers a plugin node that always fails, with the SDK's failure hooks. */
function registerFailingNode(overrides: Partial<PluginFlowNodeDefinition> = {}): string {
  const type = `plugin.failure-policy.node-${typeIndex++}`;
  registerPluginFlowNodes('failure-policy', [
    {
      type,
      label: 'Failing device',
      configSchema: {},
      inputs: ['input'],
      outputs: ['output', 'failure'],
      getFailureBehavior: (config) => config.failureBehavior as PluginFlowFailureBehavior | undefined,
      getFailureKind: (error) => (error instanceof DeviceFaultError ? 'controller-rejection' : 'node-failure'),
      execute: async () => {
        throw new DeviceFaultError('The device could not move: actuator not connected');
      },
      ...overrides,
    } as PluginFlowNodeDefinition,
  ]);
  return type;
}

function doorUnlockEvent(): ResourceSessionStartedEvent {
  const usage = {
    id: 100,
    resourceId: 1,
    userId: 1,
    usageAction: ResourceUsageAction.DoorUnlock,
    startTime: new Date('2025-01-01T00:00:00Z'),
    endTime: new Date('2025-01-01T00:00:01Z'),
    resource: { id: 1, name: 'Door', type: ResourceType.Door, metadata: null },
    user: { id: 1, username: 'user', externalIdentifier: null },
  } as unknown as UsageSession;
  return new ResourceSessionStartedEvent(usage);
}

describe('plugin node failure behaviour', () => {
  const scope = { createNode, errorShapeIndex: 0 } as FlowExecutionTestScope;
  let afterOutput: jest.Mock;
  let afterFailure: jest.Mock;

  beforeEach(() => {
    resetTestFixture(scope);
    afterOutput = jest.fn(async (_node, input) => ({ payload: input }));
    afterFailure = jest.fn(async (_node, input) => ({ payload: input }));
  });

  /** door.unlocked → plugin node; its output and failure handles lead to recording nodes. */
  function buildDoorFlow(pluginType: string, data: Record<string, unknown>) {
    const outputType = registerRecorder(afterOutput);
    const failureType = registerRecorder(afterFailure);
    const trigger = createNode({ id: 'door', type: ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLOCKED });
    const plugin = createNode({ id: 'engage', type: pluginType as ResourceFlowNodeType, data });
    const onOutput = createNode({ id: 'on-output', type: outputType as ResourceFlowNodeType });
    const onFailure = createNode({ id: 'on-failure', type: failureType as ResourceFlowNodeType });
    scope.initialNodes = [trigger];
    scope.nodesById = { door: trigger, engage: plugin, 'on-output': onOutput, 'on-failure': onFailure };
    scope.edgesBySourceAndHandle = {
      'door|': [{ source: 'door', target: 'engage' }],
      'engage|output': [{ source: 'engage', target: 'on-output' }],
      'engage|failure': [{ source: 'engage', target: 'on-failure' }],
    };
  }

  function registerRecorder(execute: jest.Mock): string {
    const type = `plugin.failure-policy.recorder-${typeIndex++}`;
    registerPluginFlowNodes('failure-policy', [
      { type, label: 'Recorder', configSchema: {}, inputs: ['input'], outputs: ['output'], execute },
    ]);
    return type;
  }

  it('fails the door action with the node message when the node is set to fail the flow', async () => {
    buildDoorFlow(registerFailingNode(), { failureBehavior: 'fail-flow' });

    const result = scope.service.handleResourceSessionStartedEvent(doorUnlockEvent());

    await expect(result).rejects.toBeInstanceOf(ExternalEffectFailureError);
    await expect(result).rejects.toMatchObject({
      message: 'The device could not move: actuator not connected',
      failureKind: 'controller-rejection',
      status: 503,
    });
    expect(afterOutput).not.toHaveBeenCalled();
    expect(afterFailure).not.toHaveBeenCalled();
  });

  it('continues on the failure output with the flow error', async () => {
    buildDoorFlow(registerFailingNode(), { failureBehavior: 'failure-output' });

    await expect(scope.service.handleResourceSessionStartedEvent(doorUnlockEvent())).resolves.toBeUndefined();

    expect(afterOutput).not.toHaveBeenCalled();
    expect(afterFailure).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        flowError: {
          kind: 'controller-rejection',
          message: 'The device could not move: actuator not connected',
        },
      }),
      expect.anything(),
    );
  });

  it('logs the failure and continues on the normal output', async () => {
    buildDoorFlow(registerFailingNode(), { failureBehavior: 'log-and-continue' });
    scope.flowLogs.keepAlive(1);

    await expect(scope.service.handleResourceSessionStartedEvent(doorUnlockEvent())).resolves.toBeUndefined();

    expect(afterFailure).not.toHaveBeenCalled();
    expect(afterOutput).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({ flowError: expect.anything() }),
      expect.anything(),
    );
    const failure = scope.flowLogs
      .getLogs(1)
      .logs.find((log) => log.nodeId === 'engage' && log.type === 'node.processing.failed');
    expect(JSON.parse(failure?.payload ?? '{}')).toMatchObject({
      failureKind: 'controller-rejection',
      failureBehavior: 'log-and-continue',
    });
  });

  it('fails the flow when the failure hook throws or answers with an unknown behaviour', async () => {
    for (const getFailureBehavior of [
      () => {
        throw new Error('broken hook');
      },
      () => 'retry-forever' as PluginFlowFailureBehavior,
    ]) {
      buildDoorFlow(registerFailingNode({ getFailureBehavior }), {});
      await expect(scope.service.handleResourceSessionStartedEvent(doorUnlockEvent())).rejects.toBeInstanceOf(
        ExternalEffectFailureError,
      );
    }
  });

  it('keeps the door action when a node without a failure policy fails, as before', async () => {
    buildDoorFlow(registerFailingNode({ getFailureBehavior: undefined, getFailureKind: undefined }), {
      failureBehavior: 'fail-flow',
    });

    await expect(scope.service.handleResourceSessionStartedEvent(doorUnlockEvent())).resolves.toBeUndefined();
    expect(afterOutput).not.toHaveBeenCalled();
  });
});
