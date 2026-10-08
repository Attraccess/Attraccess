import {
  Resource,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceType,
} from '@attraccess/database-entities';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { Repository } from 'typeorm';

import { MqttClientService } from './../../mqtt/mqtt-client.service';

import { registerPluginFlowNodes } from './../../plugin-system/plugin-flow-node-registry';

import { ResourceHealthService } from './../health/resource-health.service';

import { ResourceUsageService } from './../usage/resourceUsage.service';

import { ExternalEffectFailureError } from './errors/external-effect-failure.error';

import { settleFlowBranches } from './flow-execution-engine';

import { FlowLogRecorderService } from './flow-log-recorder.service';

import { NodeProcessingResult } from './node-executors';

import { ResourceFlowVariablesService } from './resource-flow-variables.service';

import { ResourceFlowsExecutorService } from './resource-flows-executor.service';

import { resetTestFixture } from './resource-flows-executor.service.setup.test-fixture';

import { createNode } from './resource-flows-executor.service.spec.create-node';

import { Edge } from './resource-flows-executor.service.spec.edge';

jest.mock('axios');

export type ResourceFlowsExecutorServiceRunFlowTestScope = {
  initialNodes: ResourceFlowNode[];
  createNode: typeof createNode;
  mqttClientService: MqttClientService;
  service: ResourceFlowsExecutorService;
  resourceUsageService: ResourceUsageService;
  nodesById: Record<string, ResourceFlowNode>;
  errorShapeIndex: number;
  edgesBySourceAndHandle: Record<string, Edge[]>;
  flowLogs: FlowLogRecorderService;
  operatingIntervals: { transition: jest.Mock };
  flowNodeRepository: Partial<Repository<ResourceFlowNode>>;
  flowEdgeRepository: Partial<Repository<Edge>>;
  resourceRepository: Partial<Repository<Resource>>;
  eventEmitter: EventEmitter2;
  resourceHealthService: ResourceHealthService;
  variablesService: ResourceFlowVariablesService;
};

export type ResourceFlowsExecutorServiceMqttTestScope = {
  initialNodes: ResourceFlowNode[];
  service: ResourceFlowsExecutorService;
  nodesById: Record<string, ResourceFlowNode>;
  edgesBySourceAndHandle: Record<string, { source: string; target: string; sourceHandle?: string | null }[]>;
  eventEmitter: EventEmitter2;
  mqttClientService: MqttClientService;
  flowLogs: FlowLogRecorderService;
  createNode: typeof createNode;
  flowNodeRepository: Partial<Repository<ResourceFlowNode>>;
  flowEdgeRepository: Partial<Repository<ResourceFlowEdge>>;
  resourceRepository: Partial<Repository<Resource>>;
  resourceUsageService: ResourceUsageService;
  resourceHealthService: ResourceHealthService;
  variablesService: ResourceFlowVariablesService;
};

// Minimal edge shape for our mocks
// Helper to create a node
describe('ResourceFlowsExecutorService.runFlow', () => {
  let errorShapeIndex = 0;

  let service: ResourceFlowsExecutorService;

  // Repositories and dependencies
  let flowNodeRepository: Partial<Repository<ResourceFlowNode>>;

  let flowEdgeRepository: Partial<Repository<Edge>>;

  let flowLogs: FlowLogRecorderService;

  let resourceRepository: Partial<Repository<Resource>>;

  let mqttClientService: MqttClientService;

  let resourceUsageService: ResourceUsageService;

  let eventEmitter: EventEmitter2;

  let resourceHealthService: ResourceHealthService;

  let variablesService: ResourceFlowVariablesService;

  let operatingIntervals: { transition: jest.Mock };

  // Dynamic stores per test
  let nodesById: Record<string, ResourceFlowNode>;

  let initialNodes: ResourceFlowNode[];

  const scope = {
    get initialNodes() {
      return initialNodes;
    },
    set initialNodes(value: typeof initialNodes) {
      initialNodes = value;
    },
    get createNode() {
      return createNode;
    },
    get mqttClientService() {
      return mqttClientService;
    },
    set mqttClientService(value: typeof mqttClientService) {
      mqttClientService = value;
    },
    get service() {
      return service;
    },
    set service(value: typeof service) {
      service = value;
    },
    get resourceUsageService() {
      return resourceUsageService;
    },
    set resourceUsageService(value: typeof resourceUsageService) {
      resourceUsageService = value;
    },
    get nodesById() {
      return nodesById;
    },
    set nodesById(value: typeof nodesById) {
      nodesById = value;
    },
    get errorShapeIndex() {
      return errorShapeIndex;
    },
    set errorShapeIndex(value: typeof errorShapeIndex) {
      errorShapeIndex = value;
    },
    get edgesBySourceAndHandle() {
      return edgesBySourceAndHandle;
    },
    set edgesBySourceAndHandle(value: typeof edgesBySourceAndHandle) {
      edgesBySourceAndHandle = value;
    },
    get flowLogs() {
      return flowLogs;
    },
    set flowLogs(value: typeof flowLogs) {
      flowLogs = value;
    },
    get operatingIntervals() {
      return operatingIntervals;
    },
    set operatingIntervals(value: typeof operatingIntervals) {
      operatingIntervals = value;
    },
    get flowNodeRepository() {
      return flowNodeRepository;
    },
    set flowNodeRepository(value: typeof flowNodeRepository) {
      flowNodeRepository = value;
    },
    get flowEdgeRepository() {
      return flowEdgeRepository;
    },
    set flowEdgeRepository(value: typeof flowEdgeRepository) {
      flowEdgeRepository = value;
    },
    get resourceRepository() {
      return resourceRepository;
    },
    set resourceRepository(value: typeof resourceRepository) {
      resourceRepository = value;
    },
    get eventEmitter() {
      return eventEmitter;
    },
    set eventEmitter(value: typeof eventEmitter) {
      eventEmitter = value;
    },
    get resourceHealthService() {
      return resourceHealthService;
    },
    set resourceHealthService(value: typeof resourceHealthService) {
      resourceHealthService = value;
    },
    get variablesService() {
      return variablesService;
    },
    set variablesService(value: typeof variablesService) {
      variablesService = value;
    },
  };

  let edgesBySourceAndHandle: Record<string, Edge[]>;
  // key: `${source}|${handle ?? ''}`

  beforeEach(() => {
    resetTestFixture(scope);
  });

  it('subscribes valid MQTT triggers and waits, preserving QoS and tolerating a failed subscription', async () => {
    scope.initialNodes = [
      scope.createNode({
        type: ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED,
        data: { serverId: 1, topic: 'events' },
      }),
      scope.createNode({ type: ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED, data: { topic: 'missing-server' } }),
      scope.createNode({
        type: ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE,
        data: { serverId: 2, topic: 'reply', subscribeQos: 2 },
      }),
      scope.createNode({ type: ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE, data: { serverId: 2 } }),
    ];
    scope.mqttClientService.subscribe = jest
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    await scope.service.onModuleInit();
    expect(scope.mqttClientService.subscribe).toHaveBeenCalledTimes(2);
    expect(scope.mqttClientService.subscribe).toHaveBeenNthCalledWith(1, 1, 'events', undefined);
    expect(scope.mqttClientService.subscribe).toHaveBeenNthCalledWith(2, 2, 'reply', 2);
  });

  it.each(['connected', 'disconnected'] as const)(
    'matches companion USB %s filters before starting flows',
    async (kind) => {
      const type =
        kind === 'connected'
          ? ResourceFlowNodeType.INPUT_COMPANION_USB_DEVICE_CONNECTED
          : ResourceFlowNodeType.INPUT_COMPANION_USB_DEVICE_DISCONNECTED;
      const filters = [
        { deviceId: 7 },
        { deviceId: 7, vendorId: 10 },
        { deviceId: 7, productId: 20 },
        { deviceId: 7, vendorId: 10, productId: 20 },
        { deviceId: 7, vendorId: 99 },
        { deviceId: 7, productId: 99 },
        { deviceId: 8 },
        {},
      ];
      scope.initialNodes = filters.map((data, index) => scope.createNode({ id: String(index), type, data }));
      const start = jest
        .spyOn(scope.service as never as { startFlow: (...args: unknown[]) => Promise<void> }, 'startFlow')
        .mockResolvedValue(undefined);
      const event = { deviceId: 7, payload: { vendorId: 10, productId: 20 } };
      if (kind === 'connected') await scope.service.handleCompanionUsbConnected(event);
      else await scope.service.handleCompanionUsbDisconnected(event);
      expect(start).toHaveBeenCalledWith(scope.initialNodes.slice(0, 4), { payload: event.payload });
    },
  );

  it('allows flow buttons only for the active session owner and rejects missing buttons', async () => {
    const start = jest
      .spyOn(scope.service as never as { startFlow: (...args: unknown[]) => Promise<void> }, 'startFlow')
      .mockResolvedValue(undefined);
    scope.resourceUsageService.getActiveSession = jest.fn().mockResolvedValue({ userId: 7 });
    await expect(scope.service.pressButton(1, 'button', 0)).rejects.toThrow('not allowed');
    await expect(scope.service.pressButton(1, 'button', 8)).rejects.toThrow('not allowed');
    await expect(scope.service.pressButton(1, 'button', 7)).rejects.toThrow('UNKNOWN_BUTTON_ID');
    const button = scope.createNode({ id: 'button' });
    scope.nodesById.button = button;
    await scope.service.pressButton(1, 'button', 7);
    expect(start).toHaveBeenCalledWith(button, { payload: {} });
  });

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

  it('preserves an external-effect failure when another branch rejects first', async () => {
    const externalFailure = new ExternalEffectFailureError('controller rejected', new Error('offline'));
    let rejectExternal!: (error: Error) => void;
    const laterExternalFailure = new Promise<never>((_resolve, reject) => {
      rejectExternal = reject;
    });
    const ordinaryFailure = Promise.reject(new Error('ordinary node failure'));

    const settled = settleFlowBranches([
      ordinaryFailure as Promise<NodeProcessingResult[]>,
      laterExternalFailure as Promise<NodeProcessingResult[]>,
    ]);
    await Promise.resolve();
    rejectExternal(externalFailure);

    await expect(settled).rejects.toBe(externalFailure);
  });

  it('records the same execution identity on operating transitions and flow logs', async () => {
    const inputNode = scope.createNode({ id: 'operating-input', type: ResourceFlowNodeType.INPUT_BUTTON });
    const operatingNode = scope.createNode({
      id: 'operating-node',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_OPERATING,
    });
    scope.initialNodes = [inputNode];
    scope.nodesById = { [inputNode.id]: inputNode, [operatingNode.id]: operatingNode };
    scope.edgesBySourceAndHandle = {
      [`${inputNode.id}|`]: [{ source: inputNode.id, target: operatingNode.id }],
    };
    scope.flowLogs.start(1);

    await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {});

    const flowStart = scope.flowLogs.getLogs(1).logs.find((log) => log.type === 'flow.start');
    expect(flowStart.flowRunId).toEqual(expect.any(String));
    expect(scope.operatingIntervals.transition).toHaveBeenCalledWith(1, 'operating', {
      flowNodeId: 'operating-node',
      flowRunId: flowStart.flowRunId,
    });
  });

  it('routes a metering start and collection branch to the reply channel of its operation', async () => {
    const start = scope.createNode({
      id: 'start',
      type: ResourceFlowNodeType.INPUT_METERING_START,
      data: { meterId: 1 },
    });
    const ready = scope.createNode({
      id: 'ready',
      type: ResourceFlowNodeType.OUTPUT_METERING_READY,
      data: { meterId: 1, source: 'shelly' },
    });
    const collect = scope.createNode({
      id: 'collect',
      type: ResourceFlowNodeType.INPUT_METERING_COLLECT,
      data: { meterId: 1 },
    });
    const report = scope.createNode({
      id: 'report',
      type: ResourceFlowNodeType.OUTPUT_METERING_REPORT,
      data: { meterId: 1, value: '{{scaleDecimal reading.wh "1/1000"}}' },
    });
    scope.nodesById = { start, ready, collect, report };
    scope.edgesBySourceAndHandle = {
      'start|': [{ source: 'start', target: 'ready' }],
      'collect|': [{ source: 'collect', target: 'report' }],
    };
    const complete = jest.fn().mockResolvedValue(undefined);

    scope.initialNodes = [start];
    await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_METERING_START, {}, undefined, {
      metering: { meterId: 1, operationId: 'op-1', kind: 'start', complete },
    });
    expect(complete).toHaveBeenLastCalledWith({ kind: 'ready', baseline: undefined, source: 'shelly' });

    scope.initialNodes = [collect];
    await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_METERING_COLLECT, { reading: { wh: 1500 } }, undefined, {
      metering: { meterId: 1, operationId: 'op-2', kind: 'final', complete },
    });
    expect(complete).toHaveBeenLastCalledWith({
      kind: 'reading',
      mode: 'total',
      value: '1.5',
      observedAt: undefined,
      source: undefined,
    });
  });

  it('carries lifecycle staging identity through downstream flow nodes', async () => {
    const inputNode = scope.createNode({
      id: 'lifecycle-input',
      type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
    });
    const operatingNode = scope.createNode({
      id: 'operating-node',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_OPERATING,
    });
    const billingNode = scope.createNode({
      id: 'billing-node',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS,
      data: { name: 'Energy', description: 'Meter', unitPrice: 5, quantity: 2 },
    });
    scope.initialNodes = [inputNode];
    scope.nodesById = { [inputNode.id]: inputNode, [operatingNode.id]: operatingNode, [billingNode.id]: billingNode };
    scope.edgesBySourceAndHandle = {
      [`${inputNode.id}|`]: [{ source: inputNode.id, target: operatingNode.id }],
      [`${operatingNode.id}|`]: [{ source: operatingNode.id, target: billingNode.id }],
    };

    await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, { id: 12 }, undefined, {
      lifecycleAttemptId: 'lifecycle-attempt',
    });

    expect(scope.resourceUsageService.stageLifecycleBillingItem).toHaveBeenCalledWith('lifecycle-attempt', 1, 12, {
      name: 'Energy',
      description: 'Meter',
      unitPrice: 5,
      quantity: 2,
      externalReference: null,
    });
  });

  it('returns empty array when no trigger nodes are found', async () => {
    const result = await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, {
      any: 'data',
    });
    expect(result).toEqual([]);
    expect(scope.flowNodeRepository.find as jest.Mock).toHaveBeenCalled();
  });

  it('starts every matching plugin trigger while isolating matcher failures', async () => {
    registerPluginFlowNodes('executor-test', [
      {
        type: 'plugin.executor-test.trigger',
        label: 'Executor test trigger',
        configSchema: {},
        inputs: [],
        outputs: ['output'],
        isInput: true,
      },
    ]);
    scope.initialNodes = [
      scope.createNode({
        id: 'matching',
        type: 'plugin.executor-test.trigger' as ResourceFlowNodeType,
        resourceId: 1,
        data: { match: true },
      }),
      scope.createNode({
        id: 'throws',
        type: 'plugin.executor-test.trigger' as ResourceFlowNodeType,
        resourceId: 2,
        data: { throws: true },
      }),
      scope.createNode({
        id: 'skipped',
        type: 'plugin.executor-test.trigger' as ResourceFlowNodeType,
        resourceId: 3,
        data: { match: false },
      }),
    ];

    await scope.service.triggerPluginFlows(
      'executor-test',
      'plugin.executor-test.trigger',
      (config) => {
        if (config.throws) throw new Error('bad config');
        return config.match === true;
      },
      { source: 'plugin' },
    );

    expect(scope.flowEdgeRepository.find as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ source: 'matching' }) }),
    );
    expect(scope.flowEdgeRepository.find as jest.Mock).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ source: 'throws' }) }),
    );
  });

  it('pages plugin trigger nodes and limits concurrent flow runs', async () => {
    registerPluginFlowNodes('pagination-test', [
      {
        type: 'plugin.pagination-test.trigger',
        label: 'Pagination test trigger',
        configSchema: {},
        inputs: [],
        outputs: ['output'],
        isInput: true,
      },
    ]);
    scope.initialNodes = Array.from({ length: 101 }, (_, index) =>
      scope.createNode({
        id: `node-${String(index).padStart(3, '0')}`,
        type: 'plugin.pagination-test.trigger' as ResourceFlowNodeType,
      }),
    );

    let inFlight = 0;
    let maxInFlight = 0;
    jest.spyOn(scope.service, 'startFlow').mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      return [];
    });

    await scope.service.triggerPluginFlows('pagination-test', 'plugin.pagination-test.trigger', () => true, {});

    expect(scope.flowNodeRepository.find as jest.Mock).toHaveBeenNthCalledWith(1, {
      where: { type: 'plugin.pagination-test.trigger' },
      order: { id: 'ASC' },
      take: 100,
    });
    expect(scope.flowNodeRepository.find as jest.Mock).toHaveBeenNthCalledWith(2, {
      where: {
        type: 'plugin.pagination-test.trigger',
        id: expect.objectContaining({ _value: 'node-099' }),
      },
      order: { id: 'ASC' },
      take: 100,
    });
    expect(maxInFlight).toBeLessThanOrEqual(10);
    expect(scope.service.startFlow).toHaveBeenCalledTimes(101);
  });

  it('evaluates concurrent plugin triggers in order without waiting for earlier flow runs', async () => {
    registerPluginFlowNodes('ordering-test', [
      {
        type: 'plugin.ordering-test.trigger',
        label: 'Ordering test trigger',
        configSchema: {},
        inputs: [],
        outputs: ['output'],
        isInput: true,
      },
    ]);
    const node = scope.createNode({ id: 'trigger', type: 'plugin.ordering-test.trigger' as ResourceFlowNodeType });
    let resolveFirstLookup!: (nodes: ResourceFlowNode[]) => void;
    const firstLookup = new Promise<ResourceFlowNode[]>((resolve) => {
      resolveFirstLookup = resolve;
    });
    (scope.flowNodeRepository.find as jest.Mock).mockImplementationOnce(() => firstLookup).mockResolvedValue([node]);
    let releaseFirstFlow!: () => void;
    const firstFlow = new Promise<NodeProcessingResult[]>((resolve) => {
      releaseFirstFlow = () => resolve([]);
    });
    jest
      .spyOn(scope.service, 'startFlow')
      .mockImplementationOnce(() => firstFlow)
      .mockResolvedValueOnce([]);
    const matched: string[] = [];

    const first = scope.service.triggerPluginFlows(
      'ordering-test',
      'plugin.ordering-test.trigger',
      () => {
        matched.push('first');
        return true;
      },
      {},
    );
    const second = scope.service.triggerPluginFlows(
      'ordering-test',
      'plugin.ordering-test.trigger',
      () => {
        matched.push('second');
        return true;
      },
      {},
    );

    await Promise.resolve();
    expect(scope.flowNodeRepository.find).toHaveBeenCalledTimes(1);
    resolveFirstLookup([node]);
    await new Promise((resolve) => setImmediate(resolve));

    expect(matched).toEqual(['first', 'second']);
    expect(scope.service.startFlow).toHaveBeenCalledTimes(2);
    releaseFirstFlow();
    await Promise.all([first, second]);
  });

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

  it('continues starting matching plugin flows after a flow fails', async () => {
    registerPluginFlowNodes('failure-test', [
      {
        type: 'plugin.failure-test.trigger',
        label: 'Failure test trigger',
        configSchema: {},
        inputs: [],
        outputs: ['output'],
        isInput: true,
      },
    ]);
    scope.initialNodes = [
      scope.createNode({ id: 'first', type: 'plugin.failure-test.trigger' as ResourceFlowNodeType }),
      scope.createNode({ id: 'second', type: 'plugin.failure-test.trigger' as ResourceFlowNodeType }),
    ];
    jest.spyOn(scope.service, 'startFlow').mockRejectedValueOnce(new Error('flow failed')).mockResolvedValueOnce([]);

    await scope.service.triggerPluginFlows('failure-test', 'plugin.failure-test.trigger', () => true, {});

    expect(scope.service.startFlow).toHaveBeenCalledTimes(2);
  });

  it('returns initial data when a single input node has no outgoing edges (terminal)', async () => {
    const inputNode = scope.createNode({
      id: 'in-1',
      type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
      resourceId: 1,
    });
    scope.nodesById[inputNode.id] = inputNode;
    scope.initialNodes = [inputNode];

    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [];

    const initialData = { a: 1 };
    const result = await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, initialData);
    expect(result).toEqual([
      {
        ...initialData,
        resource: { id: 1, name: 'Resource 1', type: ResourceType.Machine, metadata: { zone: 'A' } },
      },
    ]);
  });

  it('handles a simple linear path and returns the last node payload', async () => {
    const inputNode = scope.createNode({ id: 'in-1', type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED });
    const billingNode = scope.createNode({
      id: 'out-billing-1',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS,
      data: {
        name: 'kWh',
        description: 'Energy',
        externalReference: 'power',
        unitPrice: 1,
        quantity: 2,
      },
    });
    scope.nodesById[inputNode.id] = inputNode;
    scope.nodesById[billingNode.id] = billingNode;
    scope.initialNodes = [inputNode];

    // Edge: input -> billing (no sourceHandle filter)
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: billingNode.id }];
    // Billing is terminal
    scope.edgesBySourceAndHandle[`${billingNode.id}|`] = [];

    const initialData = {};

    const result = await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, initialData);
    expect(result).toEqual([
      {
        name: 'kWh',
        description: 'Energy',
        externalReference: 'power',
        unitPrice: 1,
        quantity: 2,
        resource: { id: 1, name: 'Resource 1', type: ResourceType.Machine, metadata: { zone: 'A' } },
      },
    ]);
  });

  it('uses resource metadata in templated MQTT topics', async () => {
    const inputNode = scope.createNode({ id: 'in-1', type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED });
    const mqttNode = scope.createNode({
      id: 'mqtt-1',
      type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
      data: {
        serverId: 5,
        topic: 'devices/{{resource.metadata.deviceId}}/state',
        payload: 'ping',
      },
    });

    scope.nodesById[inputNode.id] = inputNode;
    scope.nodesById[mqttNode.id] = mqttNode;
    scope.initialNodes = [inputNode];

    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: mqttNode.id }];
    scope.edgesBySourceAndHandle[`${mqttNode.id}|`] = [];

    (scope.resourceRepository.findOne as jest.Mock).mockResolvedValueOnce({
      id: 1,
      name: 'Resource 1',
      type: ResourceType.Machine,
      metadata: { deviceId: 'abc123' },
    });

    await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, {});

    expect(scope.mqttClientService.publish).toHaveBeenCalledWith(5, 'devices/abc123/state', 'ping', {
      qos: undefined,
      retain: undefined,
    });
  });

  it('evaluates IF nodes using resource metadata in payload', async () => {
    const inputNode = scope.createNode({ id: 'in-1', type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED });
    const ifNode = scope.createNode({
      id: 'if-1',
      type: ResourceFlowNodeType.PROCESSING_IF,
      data: {
        path: 'resource.metadata.zone',
        comparisonOperator: '=',
        comparisonValue: 'B',
        comparisonValueIsPath: false,
      },
    });
    const billingNode = scope.createNode({
      id: 'out-billing-1',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS,
      data: {
        name: 'zone-fee',
        description: 'Zone specific',
        externalReference: 'zone',
        unitPrice: 3,
        quantity: 1,
      },
    });

    [inputNode, ifNode, billingNode].forEach((n) => (scope.nodesById[n.id] = n));
    scope.initialNodes = [inputNode];

    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: ifNode.id }];
    scope.edgesBySourceAndHandle[`${ifNode.id}|output-true`] = [
      { source: ifNode.id, target: billingNode.id, sourceHandle: 'output-true' },
    ];
    scope.edgesBySourceAndHandle[`${billingNode.id}|`] = [];

    (scope.resourceRepository.findOne as jest.Mock).mockResolvedValueOnce({
      id: 1,
      name: 'Resource 1',
      type: ResourceType.Machine,
      metadata: { zone: 'B' },
    });

    const result = await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, {});

    expect(result).toEqual([
      {
        name: 'zone-fee',
        description: 'Zone specific',
        externalReference: 'zone',
        unitPrice: 3,
        quantity: 1,
        resource: { id: 1, name: 'Resource 1', type: ResourceType.Machine, metadata: { zone: 'B' } },
      },
    ]);
  });

  it('fan-outs when a node has multiple outgoing edges with the same handle and returns all leaf results', async () => {
    const inputNode = scope.createNode({ id: 'in-1', type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED });
    const ifNode = scope.createNode({
      id: 'if-1',
      type: ResourceFlowNodeType.PROCESSING_IF,
      data: {
        path: 'flag',
        comparisonOperator: '=',
        comparisonValue: 'yes',
        comparisonValueIsPath: false,
      },
    });
    const billingNodeA = scope.createNode({
      id: 'out-a',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS,
      data: {
        name: 'session-fee',
        description: 'Flat',
        externalReference: 'flat',
        unitPrice: 1,
        quantity: 1,
      },
    });
    const billingNodeB = scope.createNode({
      id: 'out-b',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS,
      data: {
        name: 'session-fee',
        description: 'Flat',
        externalReference: 'flat',
        unitPrice: 1,
        quantity: 1,
      },
    });

    [inputNode, ifNode, billingNodeA, billingNodeB].forEach((n) => (scope.nodesById[n.id] = n));
    scope.initialNodes = [inputNode];

    // input -> if (no handle filter on input)
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: ifNode.id }];
    // if -> two billing nodes on the same handle 'output-true'
    scope.edgesBySourceAndHandle[`${ifNode.id}|output-true`] = [
      { source: ifNode.id, target: billingNodeA.id, sourceHandle: 'output-true' },
      { source: ifNode.id, target: billingNodeB.id, sourceHandle: 'output-true' },
    ];
    // Both billing nodes are terminals
    scope.edgesBySourceAndHandle[`${billingNodeA.id}|`] = [];
    scope.edgesBySourceAndHandle[`${billingNodeB.id}|`] = [];

    const initialData = {
      flag: 'yes',
    };

    const result = await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, initialData);
    // Both leaves return the same additional item in this setup
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: 'session-fee',
      description: 'Flat',
      externalReference: 'flat',
      unitPrice: 1,
      quantity: 1,
      resource: { id: 1, name: 'Resource 1', type: ResourceType.Machine, metadata: { zone: 'A' } },
    });
    expect(result[1]).toEqual({
      name: 'session-fee',
      description: 'Flat',
      externalReference: 'flat',
      unitPrice: 1,
      quantity: 1,
      resource: { id: 1, name: 'Resource 1', type: ResourceType.Machine, metadata: { zone: 'A' } },
    });
  });

  it('routes an external-effect failure through its failure output', async () => {
    const inputNode = scope.createNode({ id: 'in-1', type: ResourceFlowNodeType.INPUT_BUTTON });
    const mqttNode = scope.createNode({
      id: 'mqtt-1',
      type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
      data: { serverId: 1, topic: 'devices/state', failureBehavior: 'failure-output' },
    });
    const failureNode = scope.createNode({
      id: 'failure-1',
      type: ResourceFlowNodeType.PROCESSING_SET_PAYLOAD,
      data: { entries: [] },
    });
    [inputNode, mqttNode, failureNode].forEach((node) => (scope.nodesById[node.id] = node));
    scope.initialNodes = [inputNode];
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: mqttNode.id }];
    scope.edgesBySourceAndHandle[`${mqttNode.id}|failure`] = [
      { source: mqttNode.id, target: failureNode.id, sourceHandle: 'failure' },
    ];
    scope.edgesBySourceAndHandle[`${failureNode.id}|`] = [];
    scope.mqttClientService.publish = jest.fn().mockRejectedValue(new Error('Broker unavailable'));
    scope.flowLogs.start(1);

    const result = await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, { requestId: 'abc' });

    expect(result).toEqual([
      expect.objectContaining({
        requestId: 'abc',
        flowError: { kind: 'transport-dispatch', message: 'Broker unavailable' },
      }),
    ]);
    expect(
      JSON.parse(scope.flowLogs.getLogs(1).logs.find((log) => log.type === 'node.processing.failed')?.payload ?? ''),
    ).toEqual(expect.objectContaining({ failureKind: 'transport-dispatch', failureBehavior: 'failure-output' }));
  });

  it('routes a logged external-effect failure through its normal output', async () => {
    const inputNode = scope.createNode({ id: 'in-1', type: ResourceFlowNodeType.INPUT_BUTTON });
    const mqttNode = scope.createNode({
      id: 'mqtt-1',
      type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
      data: { serverId: 1, topic: 'devices/state', failureBehavior: 'log-and-continue' },
    });
    const continuationNode = scope.createNode({
      id: 'continuation-1',
      type: ResourceFlowNodeType.PROCESSING_SET_PAYLOAD,
      data: { entries: [] },
    });
    [inputNode, mqttNode, continuationNode].forEach((node) => (scope.nodesById[node.id] = node));
    scope.initialNodes = [inputNode];
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: mqttNode.id }];
    scope.edgesBySourceAndHandle[`${mqttNode.id}|output`] = [
      { source: mqttNode.id, target: continuationNode.id, sourceHandle: 'output' },
    ];
    scope.edgesBySourceAndHandle[`${mqttNode.id}|failure`] = [];
    scope.edgesBySourceAndHandle[`${continuationNode.id}|`] = [];
    scope.mqttClientService.publish = jest.fn().mockRejectedValue(new Error('Broker unavailable'));
    scope.flowLogs.start(1);

    const results = await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, { requestId: 'abc' });

    expect(results).toEqual([expect.objectContaining({ requestId: 'abc' })]);
    expect(scope.flowLogs.getLogs(1).logs).toContainEqual(
      expect.objectContaining({ nodeId: continuationNode.id, type: 'node.processing.completed' }),
    );
  });

  it('preserves the legacy flow failure behavior when no policy was saved', async () => {
    const inputNode = scope.createNode({ id: 'in-1', type: ResourceFlowNodeType.INPUT_BUTTON });
    const mqttNode = scope.createNode({
      id: 'mqtt-1',
      type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
      data: { serverId: 1, topic: 'devices/state' },
    });
    [inputNode, mqttNode].forEach((node) => (scope.nodesById[node.id] = node));
    scope.initialNodes = [inputNode];
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: mqttNode.id }];
    scope.edgesBySourceAndHandle[`${mqttNode.id}|`] = [];
    scope.mqttClientService.publish = jest.fn().mockRejectedValue(new Error('Broker unavailable'));

    await expect(scope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {})).rejects.toThrow('Broker unavailable');
  });
});
