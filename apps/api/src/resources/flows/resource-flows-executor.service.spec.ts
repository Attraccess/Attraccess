import { ResourceFlowsExecutorService } from './resource-flows-executor.service';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceFlowLog,
  ResourceFlowEdge,
  BillingTransactionItem,
} from '@attraccess/database-entities';
import { MqttClientService } from '../../mqtt/mqtt-client.service';
import { ResourceUsageService } from '../usage/resourceUsage.service';
import { FlowConfigType } from './flow.config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MqttMessageEvent as MqttMessageReceivedEvent } from '../../mqtt/mqtt-message.event';

// Minimal edge shape for our mocks
type Edge = { source: string; target: string; sourceHandle?: string | null };

// Helper to create a node
function createNode(partial: Partial<ResourceFlowNode>): ResourceFlowNode {
  return {
    id: 'node-' + Math.random().toString(36).slice(2, 8),
    type: ResourceFlowNodeType.INPUT_BUTTON,
    position: { x: 0, y: 0 },
    data: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    resourceId: 1,
    resource: undefined,
    ...partial,
  } as unknown as ResourceFlowNode;
}

describe('ResourceFlowsExecutorService.runFlow', () => {
  let service: ResourceFlowsExecutorService;

  // Repositories and dependencies
  let flowNodeRepository: Partial<Repository<ResourceFlowNode>>;
  let flowEdgeRepository: Partial<Repository<Edge>>;
  let flowLogRepository: Partial<Repository<ResourceFlowLog>>;
  let configService: Partial<ConfigService>;
  let mqttClientService: MqttClientService;
  let resourceUsageService: ResourceUsageService;
  let eventEmitter: EventEmitter2;

  // Dynamic stores per test
  let nodesById: Record<string, ResourceFlowNode>;
  let initialNodes: ResourceFlowNode[];
  let edgesBySourceAndHandle: Record<string, Edge[]>; // key: `${source}|${handle ?? ''}`

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    nodesById = {};
    initialNodes = [];
    edgesBySourceAndHandle = {};

    flowNodeRepository = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      find: jest.fn(async ({ where }: any) => {
        const { resourceId, type } = where || {};
        return initialNodes.filter((n) => n.resourceId === resourceId && n.type === type);
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findOne: jest.fn(async ({ where }: any) => {
        return nodesById[where.id] ?? null;
      }),
    };

    flowEdgeRepository = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      find: jest.fn(async ({ where }: any) => {
        const key = `${where.source}|${where.sourceHandle ?? ''}`;
        return edgesBySourceAndHandle[key] ?? [];
      }),
    } as unknown as Repository<ResourceFlowEdge>;

    flowLogRepository = {
      create: jest.fn((data) => ({ id: Math.random().toString(36), ...data })),
      save: jest.fn(async (data) => data),
    } as unknown as Repository<ResourceFlowLog>;

    configService = {
      get: jest.fn(() => ({ FLOW_LOG_TTL_DAYS: 7 }) as unknown as FlowConfigType),
    } as unknown as ConfigService;

    mqttClientService = {
      publish: jest.fn(async () => undefined),
      subscribe: jest.fn(async () => undefined),
    } as unknown as MqttClientService;
    resourceUsageService = {
      logger: new Logger(ResourceUsageService.name),
      getActiveSession: jest.fn().mockResolvedValue({ id: 'ru-1' }),
    } as unknown as ResourceUsageService;

    eventEmitter = new EventEmitter2();

    const billingItemRepoMock = {
      manager: {
        findOne: jest.fn().mockResolvedValue({ id: 1, resourceUsageId: 'ru-1' }),
        findOneBy: jest.fn(),
        save: jest.fn(async (_e: unknown, data: unknown) => data),
        update: jest.fn(),
      },
    } as unknown as Repository<BillingTransactionItem>;

    service = new ResourceFlowsExecutorService(
      flowNodeRepository as Repository<ResourceFlowNode>,
      flowEdgeRepository as unknown as Repository<ResourceFlowEdge>,
      flowLogRepository as Repository<ResourceFlowLog>,
      configService as ConfigService,
      mqttClientService,
      resourceUsageService,
      billingItemRepoMock,
      eventEmitter,
    );
  });

  it('returns empty array when no trigger nodes are found', async () => {
    const result = await service.runFlow(1, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, {
      any: 'data',
    });
    expect(result).toEqual([]);
    expect(flowNodeRepository.find as jest.Mock).toHaveBeenCalled();
  });

  it('returns initial data when a single input node has no outgoing edges (terminal)', async () => {
    const inputNode = createNode({
      id: 'in-1',
      type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
      resourceId: 1,
    });
    nodesById[inputNode.id] = inputNode;
    initialNodes = [inputNode];

    edgesBySourceAndHandle[`${inputNode.id}|`] = [];

    const initialData = { a: 1 };
    const result = await service.runFlow(1, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, initialData);
    expect(result).toEqual([initialData]);
  });

  it('handles a simple linear path and returns the last node payload', async () => {
    const inputNode = createNode({ id: 'in-1', type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED });
    const billingNode = createNode({
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
    nodesById[inputNode.id] = inputNode;
    nodesById[billingNode.id] = billingNode;
    initialNodes = [inputNode];

    // Edge: input -> billing (no sourceHandle filter)
    edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: billingNode.id }];
    // Billing is terminal
    edgesBySourceAndHandle[`${billingNode.id}|`] = [];

    const initialData = {};

    const result = await service.runFlow(1, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, initialData);
    expect(result).toEqual([
      {
        name: 'kWh',
        description: 'Energy',
        externalReference: 'power',
        unitPrice: 1,
        quantity: 2,
      },
    ]);
  });

  it('fan-outs when a node has multiple outgoing edges with the same handle and returns all leaf results', async () => {
    const inputNode = createNode({ id: 'in-1', type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED });
    const ifNode = createNode({
      id: 'if-1',
      type: ResourceFlowNodeType.PROCESSING_IF,
      data: {
        path: 'flag',
        comparisonOperator: '=',
        comparisonValue: 'yes',
        comparisonValueIsPath: false,
      },
    });
    const billingNodeA = createNode({
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
    const billingNodeB = createNode({
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

    [inputNode, ifNode, billingNodeA, billingNodeB].forEach((n) => (nodesById[n.id] = n));
    initialNodes = [inputNode];

    // input -> if (no handle filter on input)
    edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: ifNode.id }];
    // if -> two billing nodes on the same handle 'output-true'
    edgesBySourceAndHandle[`${ifNode.id}|output-true`] = [
      { source: ifNode.id, target: billingNodeA.id, sourceHandle: 'output-true' },
      { source: ifNode.id, target: billingNodeB.id, sourceHandle: 'output-true' },
    ];
    // Both billing nodes are terminals
    edgesBySourceAndHandle[`${billingNodeA.id}|`] = [];
    edgesBySourceAndHandle[`${billingNodeB.id}|`] = [];

    const initialData = {
      flag: 'yes',
    };

    const result = await service.runFlow(1, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, initialData);
    // Both leaves return the same additional item in this setup
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: 'session-fee',
      description: 'Flat',
      externalReference: 'flat',
      unitPrice: 1,
      quantity: 1,
    });
    expect(result[1]).toEqual({
      name: 'session-fee',
      description: 'Flat',
      externalReference: 'flat',
      unitPrice: 1,
      quantity: 1,
    });
  });
});

describe('ResourceFlowsExecutorService MQTT', () => {
  let service: ResourceFlowsExecutorService;
  let flowNodeRepository: Partial<Repository<ResourceFlowNode>>;
  let flowEdgeRepository: Partial<Repository<ResourceFlowEdge>>;
  let flowLogRepository: Partial<Repository<ResourceFlowLog>>;
  let configService: Partial<ConfigService>;
  let mqttClientService: MqttClientService;
  let resourceUsageService: ResourceUsageService;
  let eventEmitter: EventEmitter2;

  let nodesById: Record<string, ResourceFlowNode>;
  let initialNodes: ResourceFlowNode[];
  let edgesBySourceAndHandle: Record<string, { source: string; target: string; sourceHandle?: string | null }[]>;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    nodesById = {};
    initialNodes = [];
    edgesBySourceAndHandle = {};

    flowNodeRepository = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      find: jest.fn(async ({ where }: any) => {
        if (where?.type === ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED) {
          return initialNodes.filter((n) => n.type === ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED);
        }
        const { resourceId, type } = where || {};
        return initialNodes.filter((n) => (resourceId ? n.resourceId === resourceId : true) && n.type === type);
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findOne: jest.fn(async ({ where }: any) => {
        return nodesById[where.id] ?? null;
      }),
    };

    flowEdgeRepository = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      find: jest.fn(async ({ where }: any) => {
        const key = `${where.source}|${where.sourceHandle ?? ''}`;
        return edgesBySourceAndHandle[key] ?? [];
      }),
    } as unknown as Repository<ResourceFlowEdge>;

    flowLogRepository = {
      create: jest.fn((data) => ({ id: Math.random().toString(36), ...data })),
      save: jest.fn(async (data) => data),
    } as unknown as Repository<ResourceFlowLog>;

    configService = {
      get: jest.fn(() => ({ FLOW_LOG_TTL_DAYS: 7 }) as unknown as FlowConfigType),
    } as unknown as ConfigService;

    mqttClientService = {
      publish: jest.fn(async () => undefined),
      subscribe: jest.fn(async () => undefined),
    } as unknown as MqttClientService;
    resourceUsageService = {
      logger: new Logger(ResourceUsageService.name),
      getActiveSession: jest.fn().mockResolvedValue({ id: 'ru-1' }),
    } as unknown as ResourceUsageService;
    eventEmitter = new EventEmitter2();

    const billingItemRepoMock = {
      manager: {
        findOne: jest.fn().mockResolvedValue({ id: 1, resourceUsageId: 'ru-1' }),
        findOneBy: jest.fn(),
        save: jest.fn(async (_e: unknown, data: unknown) => data),
        update: jest.fn(),
      },
    } as unknown as Repository<BillingTransactionItem>;

    service = new ResourceFlowsExecutorService(
      flowNodeRepository as Repository<ResourceFlowNode>,
      flowEdgeRepository as unknown as Repository<ResourceFlowEdge>,
      flowLogRepository as Repository<ResourceFlowLog>,
      configService as ConfigService,
      mqttClientService,
      resourceUsageService,
      billingItemRepoMock,
      eventEmitter,
    );
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
    } as unknown as ResourceFlowNode;
    const nodeB = {
      id: 'mqtt-b',
      type: ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED,
      resourceId: 2,
      position: { x: 0, y: 0 },
      data: { serverId: 5, topic: 'sensors/#' },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as ResourceFlowNode;

    initialNodes = [nodeA, nodeB];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const startFlowSpy = jest.spyOn(service as any, 'startFlow').mockResolvedValue([] as any);

    await service.handleMqttMessageReceivedEvent(new MqttMessageReceivedEvent(5, 'sensors/room1/temp', { t: 21 }));

    expect(startFlowSpy).toHaveBeenCalled();
    const calledWith = (startFlowSpy.mock.calls[0] as unknown[])[0] as ResourceFlowNode[];
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
    } as unknown as ResourceFlowNode;

    const waitNode = {
      id: 'wait-1',
      type: ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE,
      resourceId: 1,
      position: { x: 0, y: 0 },
      data: { serverId: 7, topic: 'devices/+/state', timeoutSeconds: 2 },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as ResourceFlowNode;

    initialNodes = [inputNode];
    nodesById = { [inputNode.id]: inputNode, [waitNode.id]: waitNode } as unknown as Record<string, ResourceFlowNode>;
    edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: waitNode.id }];
    edgesBySourceAndHandle[`${waitNode.id}|`] = []; // terminal after wait

    // Emit a matching event shortly after calling runFlow
    setTimeout(() => {
      eventEmitter.emit(
        MqttMessageReceivedEvent.EVENT_NAME,
        new MqttMessageReceivedEvent(7, 'devices/abc/state', { on: true }),
      );
    }, 50);

    const results = await service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {});
    expect(results).toEqual([{ topic: 'devices/abc/state', payload: { on: true } }]);
    expect(mqttClientService.subscribe).toHaveBeenCalledWith(7, 'devices/+/state');
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
    } as unknown as ResourceFlowNode;

    const waitNode = {
      id: 'wait-1',
      type: ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE,
      resourceId: 1,
      position: { x: 0, y: 0 },
      data: { serverId: 8, topic: 'foo/#', timeoutSeconds: 1 },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as ResourceFlowNode;

    initialNodes = [inputNode];
    nodesById = { [inputNode.id]: inputNode, [waitNode.id]: waitNode } as unknown as Record<string, ResourceFlowNode>;
    edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: waitNode.id }];
    edgesBySourceAndHandle[`${waitNode.id}|`] = [];

    await expect(service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {})).rejects.toThrow(
      /Timeout waiting for MQTT message/,
    );
  });
});
