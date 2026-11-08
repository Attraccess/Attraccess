import {
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceHealthSource,
  ResourceHealthStatus,
  ResourceType,
} from '@attraccess/database-entities';
import { registerPluginFlowNodes } from '../../../plugin-system/flows/node-registry';
import { ResourceHealthChangedEvent } from '../../health/events/resource-health-changed.event';
import { registerResourceHealthServiceFixture } from '../../health/resource-health.service.resource-health-service.test-fixture';
import { FlowEventTriggersService } from './flow-event-triggers.service';
import { ExternalEffectFailureError } from '../errors/external-effect-failure.error';
import { FlowExecutionError } from '../errors/flow-execution.error';
import { settleFlowBranches } from './flow-execution-engine';
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

  it('does not follow an edge into a node of another owner, e.g. a disabled global flow', async () => {
    const own = scope.createNode({
      id: 'x-own',
      type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
      resourceId: 3,
    });
    const foreign = globalNode({
      id: 'x-foreign',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET,
      data: { status: 'unhealthy', identifier: 'x', reason: 'r' },
      flow: { enabled: false },
    } as never);
    wire(own, foreign);
    // An edge stored on the resource canvas that points into the global flow's node.
    scope.edgesBySourceAndHandle['x-own|'] = [{ source: 'x-own', target: 'x-foreign', resourceId: 3, flowId: null }];

    await scope.service.runFlow(3, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, {});

    expect(scope.resourceHealthService.reportHealth).not.toHaveBeenCalled();
    expect(scope.flowNodeRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'x-foreign', resourceId: 3, flowId: expect.objectContaining({ _type: 'isNull' }) },
    });
  });

  it("does not follow another owner's edge from a global node", async () => {
    const trigger = globalNode({ id: 'y-trigger', type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED });
    const set = globalNode({
      id: 'y-set',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET,
      data: { status: 'unhealthy', identifier: 'x', reason: 'r' },
    });
    wire(trigger, set);
    scope.edgesBySourceAndHandle['y-trigger|'] = [
      { source: 'y-trigger', target: 'y-set', resourceId: 3, flowId: null },
    ];

    await scope.service.runFlow(3, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, {});

    expect(scope.resourceHealthService.reportHealth).not.toHaveBeenCalled();
    expect(scope.flowEdgeRepository.find).toHaveBeenCalledWith({
      where: { source: 'y-trigger', sourceHandle: undefined, flowId: 5 },
    });
  });

  it("lets a resource flow's Error node abort the run even when a global flow fails first with a plain error", async () => {
    const own = scope.createNode({
      id: 'e-own',
      type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
      resourceId: 3,
    });
    const error = scope.createNode({
      id: 'e-error',
      type: ResourceFlowNodeType.PROCESSING_ERROR,
      resourceId: 3,
      data: { message: 'resource says no' },
    });
    const global = globalNode({ id: 'e-global', type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED });
    const broken = globalNode({ id: 'e-broken', type: 'not-a-node-type' as ResourceFlowNodeType });
    wire(own, error, global, broken);
    scope.edgesBySourceAndHandle['e-own|'] = [{ source: 'e-own', target: 'e-error' }];
    scope.edgesBySourceAndHandle['e-global|'] = [{ source: 'e-global', target: 'e-broken' }];
    // The resource flow reaches its Error node only after the global flow has failed.
    const findOne = scope.flowNodeRepository.findOne as jest.Mock;
    const original = findOne.getMockImplementation() as (args: { where: { id: string } }) => Promise<unknown>;
    const reachedOrder: string[] = [];
    findOne.mockImplementation(async (args: { where: { id: string } }) => {
      if (args.where.id === 'e-error') await new Promise((resolve) => setTimeout(resolve, 20));
      reachedOrder.push(args.where.id);
      return original(args);
    });

    await expect(
      scope.service.runFlow(3, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, {}),
    ).rejects.toBeInstanceOf(FlowExecutionError);
    expect(reachedOrder).toEqual(['e-broken', 'e-error']);
  });
});

describe('global plugin triggers', () => {
  it('starts plugin triggers of resource flows and enabled global flows only', async () => {
    registerPluginFlowNodes('global-plugin-test', [
      {
        type: 'plugin.global-plugin-test.trigger',
        label: 'Global plugin trigger',
        configSchema: {},
        inputs: [],
        outputs: ['output'],
        isInput: true,
      },
    ]);
    const type = 'plugin.global-plugin-test.trigger' as ResourceFlowNodeType;
    scope.initialNodes = [
      scope.createNode({ id: 'a-resource', type }),
      scope.createNode({ id: 'b-enabled', type, resourceId: null, flowId: 1, flow: { enabled: true } } as never),
      scope.createNode({ id: 'c-disabled', type, resourceId: null, flowId: 2, flow: { enabled: false } } as never),
    ];
    jest.spyOn(scope.service, 'startFlow').mockResolvedValue([]);

    await scope.service.triggerPluginFlows('global-plugin-test', type, () => true, {});

    const started = (scope.service.startFlow as jest.Mock).mock.calls.map(([node]) => node.id);
    expect(started).toEqual(['a-resource', 'b-enabled']);
  });
});

describe('settleFlowBranches', () => {
  const reject = (ms: number, error: unknown) =>
    new Promise<never>((_resolve, rejectWith) => setTimeout(() => rejectWith(error), ms));

  it('prefers a FlowExecutionError over an ordinary error that came first', async () => {
    const flowError = new FlowExecutionError('stop');
    await expect(settleFlowBranches([reject(20, flowError), reject(1, new Error('plain'))])).rejects.toBe(flowError);
  });

  it('prefers an ExternalEffectFailureError over a FlowExecutionError that came first', async () => {
    const external = new ExternalEffectFailureError('down', undefined);
    await expect(
      settleFlowBranches([reject(20, external), reject(1, new FlowExecutionError('stop')), reject(5, new Error('x'))]),
    ).rejects.toBe(external);
  });

  it('keeps the first error of the same rank', async () => {
    const first = new Error('first');
    await expect(settleFlowBranches([reject(20, new Error('second')), reject(1, first)])).rejects.toBe(first);
  });
});

describe('global flow health feedback', () => {
  // The real ResourceHealthService, so its "emit only on status change" guard is what stops the loop.
  const health = registerResourceHealthServiceFixture();

  it('does not loop when a global health-changed flow sets the same health again', async () => {
    const trigger = scope.createNode({
      id: 'loop-trigger',
      type: ResourceFlowNodeType.INPUT_RESOURCE_HEALTH_CHANGED,
      resourceId: null,
      flowId: 5,
    });
    // Same identifier and status: the health-changed payload overrides both.
    const set = scope.createNode({
      id: 'loop-set',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET,
      resourceId: null,
      flowId: 5,
      data: { status: 'healthy', identifier: 'ignored' },
    });
    scope.initialNodes = [trigger, set];
    scope.nodesById[trigger.id] = trigger;
    scope.nodesById[set.id] = set;
    scope.edgesBySourceAndHandle['loop-trigger|'] = [{ source: 'loop-trigger', target: 'loop-set' }];

    const report = jest.spyOn(health.service, 'reportHealth');
    scope.resourceHealthService.reportHealth = ((input) =>
      health.service.reportHealth(input)) as typeof scope.resourceHealthService.reportHealth;
    const triggers = new FlowEventTriggersService(scope.service, {} as never, {} as never);
    const runFlow = jest.spyOn(scope.service, 'runFlow');
    const events: ResourceHealthChangedEvent[] = [];
    const runs: Promise<void>[] = [];
    health.eventEmitter.on(ResourceHealthChangedEvent.EVENT_NAME, (event: ResourceHealthChangedEvent) => {
      events.push(event);
      runs.push(triggers.onHealthChanged(event));
    });

    await health.service.reportHealth({
      resourceId: 3,
      identifier: 'bridge',
      status: ResourceHealthStatus.UNHEALTHY,
      reason: 'lost',
      source: ResourceHealthSource.HEARTBEAT,
    });
    for (let index = 0; index < runs.length; index++) await runs[index];

    // The flow ran once and reported the same state again, which emitted no second change.
    expect(runFlow).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenLastCalledWith(
      expect.objectContaining({ resourceId: 3, identifier: 'bridge', status: ResourceHealthStatus.UNHEALTHY }),
    );
    expect(events).toHaveLength(1);
    expect(health.records).toEqual([
      expect.objectContaining({ resourceId: 3, identifier: 'bridge', status: ResourceHealthStatus.UNHEALTHY }),
    ]);
  });
});
