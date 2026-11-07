import { ResourceFlowNode, ResourceFlowNodeType, ResourceType } from '@attraccess/database-entities';
import { ExternalEffectFailureError } from '../errors/external-effect-failure.error';
import { Edge } from './fixtures/edge.test-fixture';
import { createNode } from './fixtures/node.test-fixture';
import { resetTestFixture } from './fixtures/setup.test-fixture';
import type { ResourceFlowsExecutorServiceRunFlowTestScope } from './resource-flows-executor.service.spec';

jest.mock('axios');

// The fixture wires the executor service with in-memory repositories and a machine as every resource.
const scope = {
  createNode,
  edgesBySourceAndHandle: {} as Record<string, Edge[]>,
} as unknown as ResourceFlowsExecutorServiceRunFlowTestScope;

beforeEach(() => resetTestFixture(scope));

describe('global flows', () => {
  const globalNode = (partial: Partial<ResourceFlowNode>) =>
    scope.createNode({ resourceId: null, flowId: 5, ...partial });
  const wire = (...nodes: ResourceFlowNode[]) => {
    scope.initialNodes = nodes;
    for (const node of nodes) scope.nodesById[node.id] = node;
  };

  it('runs enabled global flows together with the resource flow for the same trigger', async () => {
    const own = scope.createNode({
      id: 'own',
      type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
      resourceId: 3,
    });
    const global = globalNode({ id: 'global', type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED });
    const other = scope.createNode({
      id: 'other',
      type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
      resourceId: 4,
    });
    wire(own, global, other);
    const start = jest.spyOn(scope.service, 'startFlow').mockResolvedValue([]);

    await scope.service.runFlow(3, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, { a: 1 }, undefined, {
      actorUserId: 9,
      lifecycleAttemptId: 'attempt',
    });

    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith([own, global], { payload: { a: 1 } }, undefined, expect.any(Map), {
      actorUserId: 9,
      lifecycleAttemptId: 'attempt',
      triggeringResourceId: 3,
    });
  });

  it('never runs disabled global flows', async () => {
    const disabled = globalNode({
      id: 'off',
      type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
      flow: { enabled: false },
    } as Partial<ResourceFlowNode>);
    wire(disabled);
    const start = jest.spyOn(scope.service, 'startFlow').mockResolvedValue([]);

    await scope.service.runFlow(3, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, {});

    expect(start).not.toHaveBeenCalled();
  });

  it('does not fire machine triggers for doors, and door triggers not for machines', async () => {
    wire(
      globalNode({ id: 'machine', type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED }),
      globalNode({ id: 'door', type: ResourceFlowNodeType.INPUT_RESOURCE_DOOR_LOCKED }),
    );
    const start = jest.spyOn(scope.service, 'startFlow').mockResolvedValue([]);

    // The fixture's resource is a machine.
    await scope.service.runFlow(3, ResourceFlowNodeType.INPUT_RESOURCE_DOOR_LOCKED, {});
    expect(start).not.toHaveBeenCalled();

    scope.resourceRepository.findOne = jest.fn(async () => ({ id: 3, type: ResourceType.Door })) as never;
    await scope.service.runFlow(3, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, {});
    expect(start).not.toHaveBeenCalled();
    await scope.service.runFlow(3, ResourceFlowNodeType.INPUT_RESOURCE_DOOR_LOCKED, {});
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('lets a failing global flow reject the run like a failing resource flow', async () => {
    const trigger = globalNode({ id: 'g-trigger', type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED });
    const error = globalNode({
      id: 'g-error',
      type: ResourceFlowNodeType.PROCESSING_ERROR,
      data: { message: 'global boom' },
    });
    wire(trigger, error);
    scope.edgesBySourceAndHandle['g-trigger|output'] = [{ source: 'g-trigger', target: 'g-error' }];
    scope.edgesBySourceAndHandle['g-trigger|'] = scope.edgesBySourceAndHandle['g-trigger|output'];

    await expect(scope.service.runFlow(3, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, {})).rejects.toThrow(
      'global boom',
    );
  });

  it.each([ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED])(
    'aborts a %s run when a fail-flow node of a global flow fails',
    async (triggerType) => {
      const trigger = globalNode({ id: 'f-trigger', type: triggerType });
      const mqtt = globalNode({
        id: 'f-mqtt',
        type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
        data: { serverId: 1, topic: 'down', failureBehavior: 'fail-flow' },
      });
      wire(trigger, mqtt);
      scope.edgesBySourceAndHandle['f-trigger|'] = [{ source: 'f-trigger', target: 'f-mqtt' }];
      scope.mqttClientService.publish = jest.fn().mockRejectedValue(new Error('Broker unavailable'));

      await expect(scope.service.runFlow(3, triggerType, {})).rejects.toBeInstanceOf(ExternalEffectFailureError);
    },
  );

  it('keeps global-flow logs under the flow and gives every flow its own run id', async () => {
    const first = globalNode({ id: 'l-1', flowId: 5, type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED });
    const second = globalNode({ id: 'l-2', flowId: 6, type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED });
    const own = scope.createNode({
      id: 'l-own',
      resourceId: 3,
      type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
    });
    wire(first, second, own);
    scope.flowLogs.start('flow:5');
    scope.flowLogs.start('flow:6');
    scope.flowLogs.start(3);

    await scope.service.runFlow(3, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, {});

    const runIds = [scope.flowLogs.getLogs('flow:5'), scope.flowLogs.getLogs('flow:6'), scope.flowLogs.getLogs(3)].map(
      (response) => new Set(response.logs.map((log) => log.flowRunId)),
    );
    for (const ids of runIds) expect(ids.size).toBe(1);
    expect(new Set(runIds.flatMap((ids) => [...ids])).size).toBe(3);
    expect(scope.flowLogs.getLogs('flow:5').logs[0]).toMatchObject({ flowId: 5, resourceId: null });
  });

  it('acts on the triggering resource and puts it into the payload of a global flow', async () => {
    const trigger = globalNode({ id: 'h-trigger', type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED });
    const set = globalNode({
      id: 'h-set',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET,
      data: { status: 'unhealthy', identifier: 'x', reason: 'r' },
    });
    wire(trigger, set);
    scope.edgesBySourceAndHandle['h-trigger|'] = [{ source: 'h-trigger', target: 'h-set' }];

    const results = await scope.service.runFlow(3, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, {});

    expect(scope.resourceHealthService.reportHealth).toHaveBeenCalledWith(expect.objectContaining({ resourceId: 3 }));
    expect(results[0]).toMatchObject({ resource: { id: 3, type: ResourceType.Machine } });
  });

  it('fails a resource-acting node as a node error when the run has no triggering resource', async () => {
    const set = globalNode({
      id: 'no-res',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET,
      data: { status: 'unhealthy', identifier: 'x', reason: 'r' },
    });
    wire(set);

    await expect(scope.service.startFlow(set, { payload: {} })).rejects.toThrow(/no triggering resource/);
    expect(scope.resourceHealthService.reportHealth).not.toHaveBeenCalled();
  });

  it('does not add a resource object to the payload of a run without a triggering resource', async () => {
    const wait = globalNode({
      id: 'no-res-payload',
      type: ResourceFlowNodeType.PROCESSING_SET_PAYLOAD,
      data: { payload: '{"k":1}' },
    });
    wire(wait);

    const [result] = await scope.service.startFlow(wait, { payload: { topic: 't' } });

    expect(result.payload).not.toHaveProperty('resource');
  });

  it('fails a machine-only node of a global flow when the triggering resource is a door', async () => {
    const activity = globalNode({ id: 'track', type: ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_TRACK_ACTIVITY });
    wire(activity);
    scope.resourceRepository.findOne = jest.fn(async () => ({ id: 3, type: ResourceType.Door })) as never;

    await expect(
      scope.service.startFlow(activity, { payload: {} }, undefined, new Map(), { triggeringResourceId: 3 }),
    ).rejects.toThrow(/only works for machines/);
  });
});
