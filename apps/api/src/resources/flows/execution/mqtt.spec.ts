import { FlowNodeRecord, ResourceFlowNodeType, ResourceType } from '@attraccess/application-models';

import { Logger } from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { CompanionGatewayService } from '../../../companion/companion-gateway.service';

import { CronTimer } from '../../../metrics/instrumentation/cron/cron.helper';

import { FlowTimer } from '../../../metrics/instrumentation/flow/flow.helper';

import { MqttClientService } from '../../../mqtt/mqtt-client.service';

import { MqttMessageEvent as MqttMessageReceivedEvent } from '../../../mqtt/mqtt-message.event';

import { ResourceHealthService } from '../../health/resource-health.service';

import { ResourceUsageService } from '../../usage/sessions/resource-usage.service';

import { FlowLogRecorderService } from '../logs/flow-log-recorder.service';

import { ResourceFlowVariablesService } from '../variables/resource-flow-variables.service';

import { ResourceFlowsExecutorService } from './resource-flows-executor.service';

import { createNode } from './fixtures/node.test-fixture';

import { createFakeFlowTriggerStore, FakeFlowTriggerStore } from './fixtures/fake-flow-trigger-store.test-fixture';

import type { TransactionScope, UnitOfWork } from '../../../database/unit-of-work';

jest.mock('axios');

describe('ResourceFlowsExecutorService MQTT', () => {
  let service: ResourceFlowsExecutorService;

  let flowStore: FakeFlowTriggerStore;

  let flowLogs: FlowLogRecorderService;

  let mqttClientService: MqttClientService;

  let resourceUsageService: ResourceUsageService;

  let eventEmitter: EventEmitter2;

  let resourceHealthService: ResourceHealthService;

  let variablesService: ResourceFlowVariablesService;

  let nodesById: Record<string, FlowNodeRecord>;

  let initialNodes: FlowNodeRecord[];

  let edgesBySourceAndHandle: Record<string, { source: string; target: string; sourceHandle?: string | null }[]>;

  const scope = {
    get initialNodes() {
      return initialNodes;
    },
    set initialNodes(value: typeof initialNodes) {
      initialNodes = value;
    },
    get service() {
      return service;
    },
    set service(value: typeof service) {
      service = value;
    },
    get nodesById() {
      return nodesById;
    },
    set nodesById(value: typeof nodesById) {
      nodesById = value;
    },
    get edgesBySourceAndHandle() {
      return edgesBySourceAndHandle;
    },
    set edgesBySourceAndHandle(value: typeof edgesBySourceAndHandle) {
      edgesBySourceAndHandle = value;
    },
    get eventEmitter() {
      return eventEmitter;
    },
    set eventEmitter(value: typeof eventEmitter) {
      eventEmitter = value;
    },
    get mqttClientService() {
      return mqttClientService;
    },
    set mqttClientService(value: typeof mqttClientService) {
      mqttClientService = value;
    },
    get flowLogs() {
      return flowLogs;
    },
    set flowLogs(value: typeof flowLogs) {
      flowLogs = value;
    },
    get createNode() {
      return createNode;
    },
    get flowStore() {
      return flowStore;
    },
    get resourceUsageService() {
      return resourceUsageService;
    },
    set resourceUsageService(value: typeof resourceUsageService) {
      resourceUsageService = value;
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

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    nodesById = {};
    initialNodes = [];
    edgesBySourceAndHandle = {};

    flowStore = createFakeFlowTriggerStore(scope);

    flowLogs = new FlowLogRecorderService();

    mqttClientService = {
      publish: jest.fn(async () => undefined),
      subscribe: jest.fn(async () => undefined),
    } as unknown as MqttClientService;
    resourceUsageService = {
      logger: new Logger(ResourceUsageService.name),
      getActiveSession: jest.fn().mockResolvedValue({ id: 'ru-1' }),
      getActiveSessionsForResource: jest.fn().mockResolvedValue([{ id: 'ru-1' }]),
    } as unknown as ResourceUsageService;
    eventEmitter = new EventEmitter2();

    resourceHealthService = {
      reportHealth: jest.fn(async () => undefined),
      isResourceUnhealthy: jest.fn(async () => false),
      listForResource: jest.fn(async () => []),
      getSummary: jest.fn(async () => ({ resourceId: 1, isHealthy: true, entries: [], unhealthyEntries: [] })),
    } as unknown as ResourceHealthService;

    variablesService = {
      get: jest.fn(async () => undefined),
      getMany: jest.fn(async () => ({})),
      getAll: jest.fn(async () => ({ resource: {}, global: {} })),
      set: jest.fn(async () => undefined),
      delete: jest.fn(async () => undefined),
      listForResource: jest.fn(async () => []),
    } as unknown as ResourceFlowVariablesService;

    const billingItems = { addToPendingBill: jest.fn().mockResolvedValue(true) };
    const unitOfWork = {
      run: jest.fn(async (work: (scope: TransactionScope) => Promise<unknown>) =>
        work({ isOpen: true, afterCommit: () => undefined }),
      ),
      current: jest.fn(),
    };

    service = new ResourceFlowsExecutorService(
      flowStore,
      flowLogs,
      mqttClientService,
      billingItems,
      unitOfWork as unknown as UnitOfWork,
      eventEmitter,
      resourceHealthService,
      variablesService,
      { time: (_n, fn) => fn() } as unknown as CronTimer,
      {
        timeFlow: <T>(_t: string, fn: () => Promise<T>) => fn(),
        timeNode: <T>(_n: string, fn: () => Promise<T>) => fn(),
      } as unknown as FlowTimer,
      {
        sendLockCommand: jest.fn(() => true),
        sendUnlockCommand: jest.fn(() => true),
      } as unknown as CompanionGatewayService,
      { transition: jest.fn() } as never,
    );
    service.attachUsage(resourceUsageService);
    service.attachMetering({ report: jest.fn() } as never);
  });

  it('matches INPUT_MQTT_MESSAGE_RECEIVED nodes using wildcards', async () => {
    const nodeA = {
      id: 'mqtt-a',
      type: ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED,
      resourceId: 1,
      position: { x: 0, y: 0 },
      data: { serverId: 5, topic: 'sensors/+/temp' },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as FlowNodeRecord;
    const nodeB = {
      id: 'mqtt-b',
      type: ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED,
      resourceId: 2,
      position: { x: 0, y: 0 },
      data: { serverId: 5, topic: 'sensors/#' },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as FlowNodeRecord;

    scope.initialNodes = [nodeA, nodeB];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const startFlowSpy = jest.spyOn(scope.service as any, 'startFlow').mockResolvedValue([] as any);

    await scope.service.handleMqttMessageReceivedEvent(
      new MqttMessageReceivedEvent(5, 'sensors/room1/temp', { t: 21 }),
    );

    expect(startFlowSpy).toHaveBeenCalled();
    const calledWith = (startFlowSpy.mock.calls[0] as unknown[])[0] as FlowNodeRecord[];
    const nodeIds = (Array.isArray(calledWith) ? calledWith : [calledWith]).map((n) => n.id);
    expect(new Set(nodeIds)).toEqual(new Set(['mqtt-a', 'mqtt-b']));
  });

  it('processing.mqtt.waitForMessage resolves with {topic, payload} before timeout', async () => {
    // Build flow: INPUT -> WAIT -> (terminal)
    const inputNode = {
      id: 'in-1',
      type: ResourceFlowNodeType.INPUT_BUTTON,
      resourceId: 1,
      position: { x: 0, y: 0 },
      data: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as FlowNodeRecord;

    const waitNode = {
      id: 'wait-1',
      type: ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE,
      resourceId: 1,
      position: { x: 0, y: 0 },
      data: { serverId: 7, topic: 'devices/+/state', timeoutSeconds: 2 },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as FlowNodeRecord;

    scope.initialNodes = [inputNode];
    scope.nodesById = { [inputNode.id]: inputNode, [waitNode.id]: waitNode } as unknown as Record<
      string,
      FlowNodeRecord
    >;
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: waitNode.id }];
    scope.edgesBySourceAndHandle[`${waitNode.id}|`] = []; // terminal after wait

    // Emit a matching event shortly after calling runFlow
    setTimeout(() => {
      scope.eventEmitter.emit(
        MqttMessageReceivedEvent.EVENT_NAME,
        new MqttMessageReceivedEvent(7, 'devices/abc/state', { on: true }),
      );
    }, 50);

    const results = await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {});
    expect(results).toEqual([
      {
        topic: 'devices/abc/state',
        payload: { on: true },
        resource: { id: 1, name: 'Resource 1', type: ResourceType.Machine, metadata: { zone: 'A' } },
      },
    ]);
    expect(scope.mqttClientService.subscribe).toHaveBeenCalledWith(7, 'devices/+/state', undefined);
  });

  it('processing.mqtt.waitForMessage times out and throws error', async () => {
    const inputNode = {
      id: 'in-1',
      type: ResourceFlowNodeType.INPUT_BUTTON,
      resourceId: 1,
      position: { x: 0, y: 0 },
      data: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as FlowNodeRecord;

    const waitNode = {
      id: 'wait-1',
      type: ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE,
      resourceId: 1,
      position: { x: 0, y: 0 },
      data: { serverId: 8, topic: 'foo/#', timeoutSeconds: 1, failureBehavior: 'fail-flow' },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as FlowNodeRecord;

    scope.initialNodes = [inputNode];
    scope.nodesById = { [inputNode.id]: inputNode, [waitNode.id]: waitNode } as unknown as Record<
      string,
      FlowNodeRecord
    >;
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: waitNode.id }];
    scope.edgesBySourceAndHandle[`${waitNode.id}|`] = [];
    scope.flowLogs.keepAlive(1);

    await expect(scope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {})).rejects.toThrow(
      /Timeout waiting for MQTT message/,
    );

    const failedLog = scope.flowLogs.getLogs(1).logs.find((log) => log.type === 'node.processing.failed');
    expect(failedLog).toBeDefined();
    expect(JSON.parse(failedLog?.payload ?? '')).toEqual({
      error: "Timeout waiting for MQTT message on topic 'foo/#' (server 8)",
      failureKind: 'acknowledgement-timeout',
      failureBehavior: 'fail-flow',
    });
  });

  it('records MQTT context when publishing rejects without an error message', async () => {
    const inputNode = scope.createNode({ id: 'in-1' });
    const outputNode = scope.createNode({
      id: 'output-1',
      type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
      data: { serverId: 1, topic: 'devices/state', payload: 'on' },
    });

    scope.initialNodes = [inputNode];
    scope.nodesById = { [inputNode.id]: inputNode, [outputNode.id]: outputNode };
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: outputNode.id }];
    scope.mqttClientService.publish = jest.fn().mockRejectedValue({});
    scope.flowLogs.keepAlive(1);

    await expect(scope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {})).rejects.toThrow(
      "Failed to publish MQTT message to topic 'devices/state' on server 1: no error details were provided",
    );

    const failedLog = scope.flowLogs.getLogs(1).logs.find((log) => log.type === 'node.processing.failed');
    expect(failedLog).toBeDefined();
    expect(JSON.parse(failedLog?.payload ?? '')).toEqual({
      error: "Failed to publish MQTT message to topic 'devices/state' on server 1: no error details were provided",
      failureKind: 'transport-dispatch',
      failureBehavior: 'fail-flow',
    });
  });
});
