import { createMock } from '@golevelup/ts-jest';
import type { PluginFlowTriggerNodeDefinition } from '@attraccess/plugins-backend-sdk';
import { ResourceFlowNodeType, ResourceType } from '@attraccess/application-models';
import { BadRequestException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MqttClientService } from '../../mqtt/mqtt-client.service';
import { registerPluginFlowNodes } from '../../plugin-system/flows/node-registry';
import { ResourceFlowChangedEvent } from './events/resource-flow-changed.event';
import { FakeFlowGraphStore, FakeFlowResourceDirectory } from './fixtures/fake-flow-graph-store.test-fixture';
import { ResourceFlowsService } from './resource-flows.service';

const testActor = { id: 7, authenticationMethod: 'session' as const };

const newService = (
  graph = new FakeFlowGraphStore(),
  resources = new FakeFlowResourceDirectory(),
  mqtt = createMock<MqttClientService>(),
  events = new EventEmitter2(),
  audit = { record: jest.fn().mockResolvedValue({}) },
) => ({
  graph,
  resources,
  mqtt,
  events,
  audit,
  service: new ResourceFlowsService(graph, resources, mqtt, events, audit as never),
});

// Before the plugin nodes below are registered: one of them has no configuration schema.
it("offers an access-only door's flow only the door trigger it fires", async () => {
  const { resources, service } = newService();
  resources.addResource(1, { type: ResourceType.Door, accessOnly: true });
  const supported = (await service.getNodeSchemas(1))
    .filter((schema) => schema.type.startsWith('input.resource.door.'))
    .filter((schema) => schema.supportedByResource)
    .map((schema) => schema.type);
  expect(supported).toEqual([ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLOCKED]);
});

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
  const { graph, resources, service } = newService();
  resources.addResource(1);
  graph.addNode({ id: 'event', type: definition.type as ResourceFlowNodeType, resourceId: 1 });
  await expect(service.getResourceFlow(1)).resolves.toMatchObject({
    validationErrors: [
      {
        nodeId: 'event',
        nodeType: definition.type,
        field: 'channelId',
        code: 'invalid',
        message: 'Select an applied channel.',
      },
    ],
  });
});

describe('node configuration errors', () => {
  afterEach(() => jest.restoreAllMocks());

  const meteringStart = (data: unknown) => ({ id: 'start', type: ResourceFlowNodeType.INPUT_METERING_START, data });

  it('reports a missing field as required, with a short message and no value', async () => {
    const { service } = newService();
    const errors = await service.validateNodeData(meteringStart({}));
    expect(errors).toStrictEqual([
      {
        nodeId: 'start',
        nodeType: ResourceFlowNodeType.INPUT_METERING_START,
        field: 'meterId',
        code: 'required',
        message: 'This field is required.',
      },
    ]);
  });

  it('reports an out-of-range value as invalid, with a message that is not JSON', async () => {
    const { service } = newService();
    const errors = await service.validateNodeData(meteringStart({ meterId: 1, timeoutSeconds: 9999 }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ field: 'timeoutSeconds', code: 'invalid' });
    expect(errors[0]).not.toHaveProperty('value');
    expect(errors[0].message).not.toMatch(/^[[{]/);
  });

  it('reports a failed check generically, without the node data', async () => {
    const { resources, service } = newService();
    resources.meterError = new Error('{"secret":"internal detail"}');
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const errors = await service.validateNodeData(
      meteringStart({ meterId: 1 }),
      new Map<string, unknown>([['meterResourceId', 1]]),
    );
    expect(errors).toStrictEqual([
      {
        nodeId: 'start',
        nodeType: ResourceFlowNodeType.INPUT_METERING_START,
        field: 'data',
        code: 'invalid',
        message: 'Invalid node configuration',
      },
    ]);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('start'), expect.stringContaining('internal detail'));
  });

  it('passes on only the field and message of plugin errors', async () => {
    registerPluginFlowNodes('validation-shape-test', [
      {
        type: 'plugin.validation-shape-test.event',
        label: 'Event',
        isInput: true,
        inputs: [],
        outputs: ['output'],
        validateConfig: jest
          .fn()
          .mockResolvedValue([
            { field: 'token', message: 'Bad token.', value: 'secret-token', nodeId: 'other', code: 'required' },
          ]),
      } as PluginFlowTriggerNodeDefinition,
    ]);
    const { service } = newService();
    await expect(
      service.validateNodeData({
        id: 'p',
        type: 'plugin.validation-shape-test.event',
        data: { token: 'secret-token' },
      }),
    ).resolves.toStrictEqual([
      {
        nodeId: 'p',
        nodeType: 'plugin.validation-shape-test.event',
        field: 'token',
        code: 'invalid',
        message: 'Bad token.',
      },
    ]);
  });

  it('reports a failing plugin check generically instead of failing the whole flow', async () => {
    registerPluginFlowNodes('validation-throw-test', [
      {
        type: 'plugin.validation-throw-test.event',
        label: 'Event',
        isInput: true,
        inputs: [],
        outputs: ['output'],
        validateConfig: jest.fn().mockRejectedValue(new Error('plugin internals')),
      },
    ]);
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { service } = newService();
    await expect(
      service.validateNodeData({ id: 'p', type: 'plugin.validation-throw-test.event', data: {} }),
    ).resolves.toStrictEqual([
      {
        nodeId: 'p',
        nodeType: 'plugin.validation-throw-test.event',
        field: 'data',
        code: 'invalid',
        message: 'Invalid node configuration',
      },
    ]);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('p'), expect.stringContaining('plugin internals'));
  });

  it('reports an unknown node type as invalid', async () => {
    const { service } = newService();
    await expect(service.validateNodeData({ id: 'x', type: 'plugin.missing.node', data: {} })).resolves.toStrictEqual([
      {
        nodeId: 'x',
        nodeType: 'plugin.missing.node',
        field: 'type',
        code: 'invalid',
        message: 'Unknown node type: plugin.missing.node',
      },
    ]);
  });
});

describe('saving MQTT flow subscriptions', () => {
  const node = (id: string, type: ResourceFlowNodeType, topic: string, serverId = 2) => ({
    id,
    type,
    position: { x: 10, y: 20 },
    data: { topic, serverId },
  });
  let context: ReturnType<typeof newService>;
  beforeEach(() => {
    context = newService();
    context.resources.addResource(1);
    context.mqtt.subscribe.mockResolvedValue(undefined);
    jest.spyOn(context.events, 'emit');
  });
  afterEach(() => jest.restoreAllMocks());

  it('persists node positions and edges, subscribing only new or changed MQTT nodes', async () => {
    const { graph, mqtt, events, service } = context;
    const receive = ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED;
    const wait = ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE;
    const nodes = [
      node('same', receive, 'same'),
      node('changed', receive, 'new'),
      node('new-wait', wait, 'wait'),
      node('same-wait', wait, 'same-wait'),
      node('changed-wait', wait, 'changed-wait', 3),
    ];
    for (const value of [
      node('same', receive, 'same'),
      node('changed', receive, 'old'),
      node('same-wait', wait, 'same-wait'),
      node('changed-wait', wait, 'changed-wait', 2),
    ]) {
      graph.addNode({ ...value, resourceId: 1 });
    }
    const edges = [{ id: 'edge', source: 'same', target: 'new-wait', sourceHandle: 'output', targetHandle: 'input' }];
    const result = await service.saveResourceFlow(1, { nodes, edges }, testActor);
    expect(mqtt.subscribe.mock.calls).toEqual([
      [2, 'new'],
      [2, 'wait'],
      [3, 'changed-wait'],
    ]);
    // The previous rows were replaced, not appended to.
    expect(graph.nodes.map((saved) => saved.id)).toEqual(nodes.map((saved) => saved.id));
    expect(result.nodes[0]).toMatchObject({ id: 'same', position: { x: 10, y: 20 }, resourceId: 1, flowId: null });
    expect(result.nodes[0]).not.toHaveProperty('resource');
    expect(result.edges[0]).toMatchObject({ ...edges[0], resourceId: 1, flowId: null });
    expect(events.emit).toHaveBeenCalledWith(ResourceFlowChangedEvent.EVENT_NAME, 1);
  });

  it('subscribes only after the canvas was stored', async () => {
    const { graph, mqtt, service } = context;
    graph.failWrite = new Error('database rejected write');
    await expect(
      service.saveResourceFlow(
        1,
        { nodes: [node('a', ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED, 'a')], edges: [] },
        testActor,
      ),
    ).rejects.toThrow('database rejected write');
    expect(mqtt.subscribe).not.toHaveBeenCalled();
  });

  it('retains invalid drafts with validation errors but skips incomplete subscriptions', async () => {
    const { mqtt, service } = context;
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
    const { graph, events, audit, service } = context;
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
    expect(graph.calls).not.toContain('replaceResourceCanvas');
    expect(events.emit).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(graph.auditEvents).toEqual([]);
  });

  it('rejects an edge to a node the canvas does not contain, names it and saves nothing', async () => {
    const { graph, events, audit, service } = context;
    const saving = service.saveResourceFlow(
      1,
      {
        nodes: [node('nut', ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED, 'a')],
        edges: [{ id: 'failure', source: 'nut', sourceHandle: 'failure', target: 'FAIL', targetHandle: null }],
      },
      testActor,
    );
    await expect(saving).rejects.toBeInstanceOf(BadRequestException);
    await expect(saving).rejects.toMatchObject({
      response: {
        message: [expect.stringContaining('failure')],
        edges: [{ edgeId: 'failure', source: 'nut', target: 'FAIL' }],
      },
    });
    expect(graph.calls).not.toContain('replaceResourceCanvas');
    expect(events.emit).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('does not announce a flow change when persistence fails', async () => {
    const { graph, events, service } = context;
    graph.addNode({
      ...node('old', ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED, 'a'),
      resourceId: 1,
    });
    graph.failWrite = new Error('database rejected write');
    await expect(service.saveResourceFlow(1, { nodes: [], edges: [] }, testActor)).rejects.toThrow(
      'database rejected write',
    );
    expect(events.emit).not.toHaveBeenCalled();
    expect(graph.auditEvents).toEqual([]);
    // The previous canvas is untouched.
    expect(graph.nodes.map((saved) => saved.id)).toEqual(['old']);
  });

  it('turns ids owned by another flow into a 400 that names them and keeps both canvases', async () => {
    const { graph, service } = context;
    const flow = graph.addFlow({ name: 'Notify' });
    graph.addNode({ id: 'g-start', type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, flowId: flow.id });
    graph.addEdge({ id: 'g-edge', source: 'g-start', target: 'g-start', flowId: flow.id });
    graph.addNode({ id: 'r-start', type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, resourceId: 1 });

    const saving = service.saveResourceFlow(
      1,
      {
        nodes: [
          node('g-start', ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, ''),
          node('r2', ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, ''),
        ],
        edges: [{ id: 'g-edge', source: 'g-start', target: 'r2', sourceHandle: null, targetHandle: null }],
      },
      testActor,
    );
    await expect(saving).rejects.toBeInstanceOf(BadRequestException);
    await expect(saving).rejects.toMatchObject({
      response: {
        message: [expect.stringContaining('g-start'), expect.stringContaining('g-edge')],
        nodeIds: ['g-start'],
        edgeIds: ['g-edge'],
      },
    });
    expect(graph.nodes.map((saved) => saved.id).sort()).toEqual(['g-start', 'r-start']);
    expect(graph.auditEvents).toEqual([]);
  });

  it('records the canvas change as one audit event of the save', async () => {
    const { graph, service } = context;
    await service.saveResourceFlow(
      1,
      { nodes: [node('a', ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, '')], edges: [] },
      testActor,
    );
    expect(graph.auditEvents).toEqual([
      expect.objectContaining({
        action: 'resource_flow.updated',
        actor: testActor,
        subject: { type: 'resource', id: 1 },
      }),
    ]);
  });

  it('records nothing for a missing resource', async () => {
    const { graph, resources, audit, service } = context;
    resources.resources.clear();
    await expect(service.saveResourceFlow(99, { nodes: [], edges: [] }, testActor)).rejects.toThrow();
    expect(graph.calls).not.toContain('replaceResourceCanvas');
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe('plugin node configuration schemas', () => {
  const { resources, service } = newService();
  it('resolves dynamic schemas with resource context and falls back to static schemas', async () => {
    resources.addResource(1);
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
    resources.resources.clear();
    await expect(service.resolveNodeSchema(99, 'plugin.schema-test.static', {})).rejects.toThrow();
  });
});

describe('shared machine flow warnings', () => {
  type GlobalFlowFixture = {
    flow: { id: number; name: string; enabled?: boolean };
    nodes: Array<{ id: string; type: string; data: Record<string, unknown> }>;
    edges: Array<{ id: string; source: string; target: string }>;
  };
  const build = (
    nodes: GlobalFlowFixture['nodes'],
    edges: GlobalFlowFixture['edges'],
    globalFlows: GlobalFlowFixture[] = [],
  ) => {
    const context = newService();
    context.resources.addResource(1);
    const { graph } = context;
    nodes.forEach((node) => graph.addNode({ ...node, type: node.type as ResourceFlowNodeType, resourceId: 1 }));
    edges.forEach((edge) => graph.addEdge({ ...edge, resourceId: 1 }));
    for (const global of globalFlows) {
      graph.addFlow(global.flow);
      global.nodes.forEach((node) =>
        graph.addNode({ ...node, type: node.type as ResourceFlowNodeType, flowId: global.flow.id }),
      );
      global.edges.forEach((edge) => graph.addEdge({ ...edge, flowId: global.flow.id }));
    }
    return context;
  };

  const unguardedStart = (id: number, name: string, enabled = true): GlobalFlowFixture => ({
    flow: { id, name, enabled },
    nodes: [
      { id: `start-${id}`, type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, data: {} },
      { id: `http-${id}`, type: ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST, data: {} },
    ],
    edges: [{ id: `e-${id}`, source: `start-${id}`, target: `http-${id}` }],
  });

  it('loads every enabled global flow with its canvas at once and skips disabled ones', async () => {
    const { graph, service } = build(
      [],
      [],
      [unguardedStart(5, 'On'), unguardedStart(6, 'Off', false), unguardedStart(7, 'Also on')],
    );
    const warnings = await service.getSharedMachineFlowWarnings(1);
    expect(warnings.map((warning) => [warning.flowId, warning.triggerNodeId])).toEqual([
      [5, 'start-5'],
      [7, 'start-7'],
    ]);
    // One read for the resource's own flow, one for all enabled global flows.
    expect(graph.calls).toEqual(['loadResourceCanvas', 'loadEnabledGlobalCanvases']);
  });

  it('does not report anything when no global flow is enabled', async () => {
    const { graph, service } = build([], [], [unguardedStart(6, 'Off', false)]);
    await expect(service.getSharedMachineFlowWarnings(1)).resolves.toEqual([]);
    expect(graph.calls).toEqual(['loadResourceCanvas', 'loadEnabledGlobalCanvases']);
  });

  it('lists enabled global flows without an activeSessions check, labelled with the flow', async () => {
    const { service } = build(
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
    const { service } = build(
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
    const { service } = build(
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
