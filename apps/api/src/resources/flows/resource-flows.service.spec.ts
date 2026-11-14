import { createMock } from '@golevelup/ts-jest';
import type { PluginFlowTriggerNodeDefinition } from '@attraccess/plugins-backend-sdk';
import {
  Flow,
  Resource,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceFlowNodeType,
} from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import { EntityManager, In, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MqttClientService } from '../../mqtt/mqtt-client.service';
import { registerPluginFlowNodes } from '../../plugin-system/flows/node-registry';
import { ResourceFlowChangedEvent } from './events/resource-flow-changed.event';
import { ResourceFlowsService } from './resource-flows.service';
import { openFlowCanvasDatabase, startToHttpCanvas, testActor } from './flow-canvas-database.test-fixture';

it('reports invalid plugin trigger configuration when loading a saved flow', async () => {
  const definition: PluginFlowTriggerNodeDefinition = {
    type: 'plugin.validation-test.event',
    label: 'Event',
    isInput: true,
    inputs: [],
    outputs: ['output'],
    validateConfig: jest.fn().mockResolvedValue([{ field: 'channelId', message: 'Select an applied channel.' }]),
  };
  registerPluginFlowNodes('validation-test', [definition]);
  const node = Object.assign(new ResourceFlowNode(), { id: 'event', type: definition.type, data: {} });
  const service = new ResourceFlowsService(
    createMock<Repository<ResourceFlowNode>>({ find: jest.fn().mockResolvedValue([node]) }),
    createMock<Repository<ResourceFlowEdge>>({ find: jest.fn().mockResolvedValue([]) }),
    createMock<Repository<Resource>>({ findOne: jest.fn().mockResolvedValue({ id: 1 }) }),
    createMock<MqttClientService>(),
    new EventEmitter2(),
    createMock<Repository<Flow>>(),
    { record: jest.fn().mockResolvedValue({}) } as never,
  );
  await expect(service.getResourceFlow(1)).resolves.toMatchObject({
    validationErrors: [
      { nodeId: 'event', nodeType: definition.type, field: 'channelId', message: 'Select an applied channel.' },
    ],
  });
});

describe('saving MQTT flow subscriptions', () => {
  const resource = Object.assign(new Resource(), { id: 1 });
  const oldNodes: ResourceFlowNode[] = [];
  const manager = createMock<EntityManager>();
  const mqtt = createMock<MqttClientService>();
  const events = new EventEmitter2();
  const resources = createMock<Repository<Resource>>();
  const audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };
  const service = new ResourceFlowsService(
    createMock<Repository<ResourceFlowNode>>({ manager }),
    createMock<Repository<ResourceFlowEdge>>(),
    resources,
    mqtt,
    events,
    createMock<Repository<Flow>>(),
    audit as never,
  );
  const node = (id: string, type: ResourceFlowNodeType, topic: string, serverId = 2) => ({
    id,
    type,
    position: { x: 10, y: 20 },
    data: { topic, serverId },
  });
  beforeEach(() => {
    jest.clearAllMocks();
    oldNodes.length = 0;
    resources.findOne.mockResolvedValue(resource);
    manager.transaction.mockImplementation(
      async (
        workOrIsolation: string | ((manager: EntityManager) => Promise<unknown>),
        work?: (manager: EntityManager) => Promise<unknown>,
      ) => {
        if (typeof workOrIsolation === 'function') return workOrIsolation(manager);
        if (!work) throw new Error('Missing transaction callback');
        return work(manager);
      },
    );
    // The previous canvas; the id-ownership check (no `resource` filter) finds nothing elsewhere.
    manager.find.mockImplementation(async (entity, options) =>
      entity === ResourceFlowNode && !Array.isArray(options?.where) && options?.where?.resource ? oldNodes : [],
    );
    manager.save.mockImplementation(async (_entity, entities) => entities);
    mqtt.subscribe.mockResolvedValue(undefined);
    jest.spyOn(events, 'emit');
  });
  afterEach(() => jest.restoreAllMocks());
  it('persists node positions and edges, subscribing only new or changed MQTT nodes', async () => {
    const receive = ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED;
    const wait = ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE;
    const nodes = [
      node('same', receive, 'same'),
      node('changed', receive, 'new'),
      node('new-wait', wait, 'wait'),
      node('same-wait', wait, 'same-wait'),
      node('changed-wait', wait, 'changed-wait', 3),
    ];
    oldNodes.push(
      ...[
        node('same', receive, 'same'),
        node('changed', receive, 'old'),
        node('same-wait', wait, 'same-wait'),
        node('changed-wait', wait, 'changed-wait', 2),
      ].map((value) => Object.assign(new ResourceFlowNode(), value)),
    );
    const edges = [{ id: 'edge', source: 'same', target: 'new-wait', sourceHandle: 'output', targetHandle: 'input' }];
    const result = await service.saveResourceFlow(1, { nodes, edges }, testActor);
    expect(mqtt.subscribe.mock.calls).toEqual([
      [2, 'new'],
      [2, 'wait'],
      [3, 'changed-wait'],
    ]);
    expect(manager.delete).toHaveBeenCalledWith(ResourceFlowNode, { resource: { id: 1 } });
    expect(manager.delete).toHaveBeenCalledWith(ResourceFlowEdge, { resource: { id: 1 } });
    expect(result.nodes[0]).toMatchObject({ id: 'same', position: { x: 10, y: 20 }, resource });
    expect(result.edges[0]).toMatchObject({ ...edges[0], resource });
    expect(events.emit).toHaveBeenCalledWith(ResourceFlowChangedEvent.EVENT_NAME, 1);
  });
  it('retains invalid drafts with validation errors but skips incomplete subscriptions', async () => {
    const result = await service.saveResourceFlow(
      1,
      {
        nodes: [node('invalid', ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED, '')],
        edges: [],
      },
      testActor,
    );
    expect(result.nodes).toHaveLength(1);
    expect(result.validationErrors).toEqual(expect.arrayContaining([expect.objectContaining({ nodeId: 'invalid' })]));
    expect(mqtt.subscribe).not.toHaveBeenCalled();
  });
  it('rejects a node whose plugin only supports global flows, names it and saves nothing', async () => {
    registerPluginFlowNodes('global-only-test', [
      {
        type: 'plugin.global-only-test.notify',
        label: 'Notify',
        inputs: ['input'],
        outputs: [],
        isOutput: true,
        flowScopes: ['global'],
        execute: jest.fn(),
      },
    ]);
    const saving = service.saveResourceFlow(
      1,
      {
        nodes: [
          node('mqtt', ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED, 'a'),
          { id: 'notify-1', type: 'plugin.global-only-test.notify', position: { x: 0, y: 0 }, data: {} },
        ],
        edges: [],
      },
      testActor,
    );
    await expect(saving).rejects.toBeInstanceOf(BadRequestException);
    await expect(saving).rejects.toMatchObject({
      response: {
        message: [expect.stringContaining('notify-1')],
        nodes: [{ nodeId: 'notify-1', nodeType: 'plugin.global-only-test.notify' }],
      },
    });
    expect(manager.transaction).not.toHaveBeenCalled();
    expect(manager.delete).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
  it('does not announce a flow change when persistence fails', async () => {
    manager.save.mockRejectedValueOnce(new Error('database rejected write'));
    oldNodes.push(
      Object.assign(new ResourceFlowNode(), node('old', ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED, 'a')),
    );
    await expect(service.saveResourceFlow(1, { nodes: [], edges: [] }, testActor)).rejects.toThrow(
      'database rejected write',
    );
    expect(events.emit).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
  it('records nothing for a missing resource', async () => {
    resources.findOne.mockResolvedValue(null);
    await expect(service.saveResourceFlow(99, { nodes: [], edges: [] }, testActor)).rejects.toThrow();
    expect(manager.transaction).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe('plugin node configuration schemas', () => {
  const resources = createMock<Repository<Resource>>();
  const service = new ResourceFlowsService(
    createMock<Repository<ResourceFlowNode>>(),
    createMock<Repository<ResourceFlowEdge>>(),
    resources,
    createMock<MqttClientService>(),
    new EventEmitter2(),
    createMock<Repository<Flow>>(),
    { record: jest.fn().mockResolvedValue({}) } as never,
  );
  it('resolves dynamic schemas with resource context and falls back to static schemas', async () => {
    resources.findOne.mockResolvedValue({ id: 1 } as Resource);
    const schema = { type: 'object', properties: { channelId: { type: 'string' } } };
    const resolve = jest.fn().mockResolvedValue(schema);
    registerPluginFlowNodes('schema-test', [
      {
        type: 'plugin.schema-test.dynamic',
        label: 'Dynamic',
        isInput: true,
        inputs: [],
        outputs: ['output'],
        resolveConfigSchema: resolve,
      },
      {
        type: 'plugin.schema-test.static',
        label: 'Static',
        isInput: true,
        inputs: [],
        outputs: ['output'],
        configSchema: schema,
      },
      { type: 'plugin.schema-test.empty', label: 'Empty', isInput: true, inputs: [], outputs: ['output'] },
    ]);
    expect(await service.resolveNodeSchema(1, 'plugin.schema-test.dynamic', { controllerId: 7 })).toMatchObject({
      configSchema: schema,
    });
    expect(resolve).toHaveBeenCalledWith({ controllerId: 7 }, { flowScope: 'resource', resourceId: 1, flowId: null });
    expect(
      await service.resolveNodeSchema(1, 'plugin.schema-test.dynamic', { controllerId: 7 }, 'preview'),
    ).toMatchObject({
      configSchema: { properties: {}, preview: [] },
    });
    expect(resolve).toHaveBeenLastCalledWith(
      { controllerId: 7 },
      { flowScope: 'resource', resourceId: 1, flowId: null, purpose: 'preview' },
    );
    expect(await service.resolveNodeSchema(1, 'plugin.schema-test.static', {})).toMatchObject({ configSchema: schema });
    await expect(service.resolveNodeSchema(1, 'plugin.schema-test.empty', {})).rejects.toThrow('does not provide');
    await expect(service.resolveNodeSchema(1, 'plugin.schema-test.missing', {})).rejects.toThrow('not found');
    resources.findOne.mockResolvedValue(null);
    await expect(service.resolveNodeSchema(99, 'plugin.schema-test.static', {})).rejects.toThrow();
  });
});

describe('shared machine flow warnings', () => {
  type GlobalFlowFixture = {
    flow: { id: number; name: string; enabled?: boolean };
    nodes: object[];
    edges: object[];
  };
  type Where = { flowId?: { value: number[] } };
  const build = (nodes: object[], edges: object[], globalFlows: GlobalFlowFixture[] = []) => {
    // Rows carry their flowId, as stored.
    const rows = (key: 'nodes' | 'edges') =>
      globalFlows.flatMap((g) => g[key].map((row) => ({ ...row, flowId: g.flow.id })));
    const byFlow = (own: object[], key: 'nodes' | 'edges') =>
      jest.fn(async ({ where }: { where: Where }) =>
        where.flowId === undefined
          ? own
          : rows(key).filter((row) => (where.flowId as { value: number[] }).value.includes(row.flowId)),
      ) as never;
    const nodeRepository = createMock<Repository<ResourceFlowNode>>({ find: byFlow(nodes, 'nodes') });
    const edgeRepository = createMock<Repository<ResourceFlowEdge>>({ find: byFlow(edges, 'edges') });
    const flowRepository = createMock<Repository<Flow>>({
      find: jest.fn(async ({ where }: { where: { enabled?: boolean; scope?: string } }) =>
        globalFlows
          .map((g) => ({ enabled: true, scope: 'global', ...g.flow }))
          .filter((flow) => flow.enabled === where.enabled && flow.scope === where.scope),
      ) as never,
    });
    const service = new ResourceFlowsService(
      nodeRepository,
      edgeRepository,
      createMock<Repository<Resource>>({ findOne: jest.fn().mockResolvedValue({ id: 1 }) }),
      createMock<MqttClientService>(),
      new EventEmitter2(),
      flowRepository,
      { record: jest.fn().mockResolvedValue({}) } as never,
    );
    return Object.assign(service, { nodeRepository, edgeRepository, flowRepository });
  };

  const unguardedStart = (id: number, name: string, enabled = true): GlobalFlowFixture => ({
    flow: { id, name, enabled },
    nodes: [
      { id: `start-${id}`, type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, data: {} },
      { id: `http-${id}`, type: ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST, data: {} },
    ],
    edges: [{ id: `e-${id}`, source: `start-${id}`, target: `http-${id}` }],
  });

  it('loads every enabled global flow in one node and one edge query and skips disabled ones', async () => {
    const service = build(
      [],
      [],
      [unguardedStart(5, 'On'), unguardedStart(6, 'Off', false), unguardedStart(7, 'Also on')],
    );
    const warnings = await service.getSharedMachineFlowWarnings(1);
    expect(warnings.map((warning) => [warning.flowId, warning.triggerNodeId])).toEqual([
      [5, 'start-5'],
      [7, 'start-7'],
    ]);
    expect(service.flowRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { enabled: true, scope: 'global' } }),
    );
    // One query for the resource's own flow, one for all global flows.
    expect(service.nodeRepository.find).toHaveBeenCalledTimes(2);
    expect(service.edgeRepository.find).toHaveBeenCalledTimes(2);
    expect(service.nodeRepository.find).toHaveBeenLastCalledWith({ where: { flowId: In([5, 7]) } });
    expect(service.edgeRepository.find).toHaveBeenLastCalledWith({ where: { flowId: In([5, 7]) } });
  });

  it('does not query global nodes when no global flow is enabled', async () => {
    const service = build([], [], [unguardedStart(6, 'Off', false)]);
    await expect(service.getSharedMachineFlowWarnings(1)).resolves.toEqual([]);
    expect(service.nodeRepository.find).toHaveBeenCalledTimes(1);
  });

  it('lists enabled global flows without an activeSessions check, labelled with the flow', async () => {
    const service = build(
      [],
      [],
      [
        {
          flow: { id: 5, name: 'Notify on starts' },
          nodes: [
            { id: 'start', type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, data: {} },
            { id: 'http', type: ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST, data: {} },
          ],
          edges: [{ id: 'e', source: 'start', target: 'http' }],
        },
      ],
    );
    await expect(service.getSharedMachineFlowWarnings(1)).resolves.toEqual([
      {
        flowId: 5,
        flowName: 'Notify on starts',
        triggerNodeId: 'start',
        triggerType: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
        effectNodes: [{ nodeId: 'http', nodeType: ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST }],
      },
    ]);
  });

  it('lists a stop flow that reaches a plugin output without checking activeSessions', async () => {
    registerPluginFlowNodes('warning-service-test', [
      {
        type: 'plugin.warning-service-test.switch',
        label: 'Switch',
        inputs: ['input'],
        outputs: ['output'],
        isOutput: true,
        execute: jest.fn(),
      },
    ]);
    const service = build(
      [
        { id: 'stop', type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED, data: {} },
        { id: 'power', type: 'plugin.warning-service-test.switch', data: {} },
      ],
      [{ id: 'e', source: 'stop', target: 'power' }],
    );
    await expect(service.getSharedMachineFlowWarnings(1)).resolves.toEqual([
      {
        flowId: null,
        flowName: null,
        triggerNodeId: 'stop',
        triggerType: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
        effectNodes: [{ nodeId: 'power', nodeType: 'plugin.warning-service-test.switch' }],
      },
    ]);
  });

  it('lists nothing for a flow guarded by an IF on activeSessions', async () => {
    const service = build(
      [
        { id: 'stop', type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED, data: {} },
        {
          id: 'if',
          type: ResourceFlowNodeType.PROCESSING_IF,
          data: { path: 'activeSessions.after', comparisonOperator: '=', comparisonValue: '0' },
        },
        { id: 'http', type: ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST, data: {} },
      ],
      [
        { id: 'e1', source: 'stop', target: 'if' },
        { id: 'e2', source: 'if', target: 'http' },
      ],
    );
    await expect(service.getSharedMachineFlowWarnings(1)).resolves.toEqual([]);
  });
});

// Several real SQLite schema syncs; coverage runs on loaded CI machines exceed Jest's 5 s default.
describe('saving a resource flow with ids owned by another flow', () => {
  jest.setTimeout(30_000);
  let db: Awaited<ReturnType<typeof openFlowCanvasDatabase>>;
  beforeEach(async () => {
    db = await openFlowCanvasDatabase();
  });
  afterEach(() => db.source.destroy());

  it('rejects ids of a global flow with 400 naming them and leaves both flows untouched', async () => {
    await db.globalFlows.saveCanvas(db.flow.id, startToHttpCanvas('g'), testActor);
    await db.resourceFlows.saveResourceFlow(db.resource.id, startToHttpCanvas('r'), testActor);
    db.audit.record.mockClear();

    const saving = db.resourceFlows.saveResourceFlow(
      db.resource.id,
      {
        nodes: [...startToHttpCanvas('g').nodes, ...startToHttpCanvas('r2').nodes],
        edges: startToHttpCanvas('g').edges,
      },
      testActor,
    );
    await expect(saving).rejects.toBeInstanceOf(BadRequestException);
    await expect(saving).rejects.toMatchObject({
      response: {
        message: expect.arrayContaining([expect.stringContaining('g-start'), expect.stringContaining('g-edge')]),
        nodeIds: expect.arrayContaining(['g-start', 'g-http']),
        edgeIds: ['g-edge'],
      },
    });
    expect(db.audit.record).not.toHaveBeenCalled();

    const owners = async () =>
      (await db.nodes.find({ order: { id: 'ASC' } })).map(({ id, resourceId, flowId }) => ({ id, resourceId, flowId }));
    expect(await owners()).toEqual([
      { id: 'g-http', resourceId: null, flowId: db.flow.id },
      { id: 'g-start', resourceId: null, flowId: db.flow.id },
      // The failed save rolled back: the resource's own flow is still there.
      { id: 'r-http', resourceId: db.resource.id, flowId: null },
      { id: 'r-start', resourceId: db.resource.id, flowId: null },
    ]);
    expect(await db.edges.findOneByOrFail({ id: 'g-edge' })).toMatchObject({ flowId: db.flow.id, resourceId: null });
  });

  it('saves its own ids again', async () => {
    await db.resourceFlows.saveResourceFlow(db.resource.id, startToHttpCanvas('r'), testActor);
    await expect(
      db.resourceFlows.saveResourceFlow(db.resource.id, startToHttpCanvas('r'), testActor),
    ).resolves.toMatchObject({
      nodes: [{ id: 'r-start' }, { id: 'r-http' }],
    });
    expect(await db.nodes.count({ where: { resourceId: db.resource.id } })).toBe(2);
  });
});
