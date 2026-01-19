import { ResourceFlowsExecutorService } from './resource-flows-executor.service';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  Resource,
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceFlowLog,
  ResourceFlowEdge,
  BillingTransactionItem,
  ResourceType,
} from '@attraccess/database-entities';
import { MqttClientService } from '../../mqtt/mqtt-client.service';
import { ResourceUsageService } from '../usage/resourceUsage.service';
import { FlowConfigType } from './flow.config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MqttMessageEvent as MqttMessageReceivedEvent } from '../../mqtt/mqtt-message.event';
import { NoUsageSessionError } from './errors/no-usage-session.error';

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
  let resourceRepository: Partial<Repository<Resource>>;
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

    const defaultQueryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    } as unknown as SelectQueryBuilder<ResourceFlowNode>;

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
      createQueryBuilder: jest.fn(() => defaultQueryBuilder),
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

    resourceRepository = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findOne: jest.fn(async ({ where }: any) => ({
        id: where?.id ?? 1,
        name: `Resource ${where?.id ?? 1}`,
        type: ResourceType.Machine,
        metadata: { zone: 'A' },
      })),
    } as unknown as Repository<Resource>;

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
      resourceRepository as Repository<Resource>,
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
    expect(result).toEqual([
      {
        ...initialData,
        resource: { id: 1, name: 'Resource 1', type: ResourceType.Machine, metadata: { zone: 'A' } },
      },
    ]);
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
        resource: { id: 1, name: 'Resource 1', type: ResourceType.Machine, metadata: { zone: 'A' } },
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

  it('ends the active usage session with templated notes and passes payload through', async () => {
    // Arrange nodes: INPUT -> END_SESSION (terminal)
    const inputNode = createNode({ id: 'in-1', type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED });
    const endNode = createNode({
      id: 'end-1',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_USAGE_END_SESSION,
      data: { notes: 'Ended by {{user.username}}' },
    });
    nodesById[inputNode.id] = inputNode;
    nodesById[endNode.id] = endNode;
    initialNodes = [inputNode];
    edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: endNode.id }];
    edgesBySourceAndHandle[`${endNode.id}|`] = [];

    // Mock active session and endSession
    (resourceUsageService.getActiveSession as jest.Mock).mockResolvedValue({
      id: 'ru-1',
      user: { id: 42, username: 'alice' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (resourceUsageService as any).endSession = jest.fn().mockResolvedValue(undefined);

    const initialData = { user: { username: 'bob' } };

    // Act
    const result = await service.runFlow(1, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, initialData);

    // Assert leaf payload passthrough
    expect(result).toEqual([
      {
        ...initialData,
        resource: { id: 1, name: 'Resource 1', type: ResourceType.Machine, metadata: { zone: 'A' } },
      },
    ]);

    // Assert endSession called with compiled notes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((resourceUsageService as any).endSession).toHaveBeenCalledWith(
      1,
      { id: 42, username: 'alice' },
      {
        notes: 'Ended by bob',
      },
      true,
    );
  });

  it('throws NoUsageSessionError when no active session exists', async () => {
    const inputNode = createNode({ id: 'in-1', type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED });
    const endNode = createNode({ id: 'end-1', type: ResourceFlowNodeType.OUTPUT_RESOURCE_USAGE_END_SESSION, data: {} });
    nodesById[inputNode.id] = inputNode;
    nodesById[endNode.id] = endNode;
    initialNodes = [inputNode];
    edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: endNode.id }];
    edgesBySourceAndHandle[`${endNode.id}|`] = [];

    (resourceUsageService.getActiveSession as jest.Mock).mockResolvedValue(null);

    await expect(service.runFlow(1, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, {})).rejects.toBeInstanceOf(
      NoUsageSessionError,
    );
  });

  it('updates resource activity when track-activity node executes and passes payload through', async () => {
    const resourceId = 5;
    const inputNode = createNode({ id: 'in-activity', type: ResourceFlowNodeType.INPUT_BUTTON, resourceId });
    const trackNode = createNode({
      id: 'track-activity',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_TRACK_ACTIVITY,
      resourceId,
    });
    nodesById[inputNode.id] = inputNode;
    nodesById[trackNode.id] = trackNode;
    initialNodes = [inputNode];
    edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: trackNode.id }];
    edgesBySourceAndHandle[`${trackNode.id}|`] = [];

    const payload = { foo: 'bar' };

    const resourceActivity = (service as unknown as { resourceActivity: Map<number, Date> }).resourceActivity;

    expect(resourceActivity.get(resourceId)).toBeUndefined();

    const result = await service.runFlow(resourceId, ResourceFlowNodeType.INPUT_BUTTON, payload);

    expect(result).toEqual([
      {
        ...payload,
        resource: { id: 5, name: 'Resource 5', type: ResourceType.Machine, metadata: { zone: 'A' } },
      },
    ]);
    const lastActivity = resourceActivity.get(resourceId);
    expect(lastActivity).toBeInstanceOf(Date);
  });

  it('triggers inactivity flow when resource exceeds configured inactivity minutes', async () => {
    const resourceId = 9;
    const inactivityNode = createNode({
      id: 'inactive-1',
      type: ResourceFlowNodeType.INPUT_RESOURCE_ACTIVITY_NO_ACTIVITY,
      resourceId,
      data: { minInactivityMinutes: 5 },
    });

    const qb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([inactivityNode]),
    } as unknown as SelectQueryBuilder<ResourceFlowNode>;
    const flowNodeRepoWithQueryBuilder = flowNodeRepository as { createQueryBuilder: jest.Mock };
    flowNodeRepoWithQueryBuilder.createQueryBuilder = jest.fn(() => qb);

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const resourceActivity = (service as unknown as { resourceActivity: Map<number, Date> }).resourceActivity;
    resourceActivity.set(resourceId, tenMinutesAgo);

    const serviceWithStartFlow = service as unknown as { startFlow: jest.Mock };
    const startFlowSpy = jest.spyOn(serviceWithStartFlow, 'startFlow').mockResolvedValue([]);

    await service.checkResourceActivity();

    expect(startFlowSpy).toHaveBeenCalledWith(inactivityNode, { payload: {} });
    const updatedActivity = resourceActivity.get(resourceId) as Date;
    expect(updatedActivity).toBeInstanceOf(Date);
    expect(updatedActivity.getTime()).toBeGreaterThan(tenMinutesAgo.getTime());
  });
});

describe('ResourceFlowsExecutorService MQTT', () => {
  let service: ResourceFlowsExecutorService;
  let flowNodeRepository: Partial<Repository<ResourceFlowNode>>;
  let flowEdgeRepository: Partial<Repository<ResourceFlowEdge>>;
  let flowLogRepository: Partial<Repository<ResourceFlowLog>>;
  let resourceRepository: Partial<Repository<Resource>>;
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

    resourceRepository = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findOne: jest.fn(async ({ where }: any) => ({
        id: where?.id ?? 1,
        name: `Resource ${where?.id ?? 1}`,
        type: ResourceType.Machine,
        metadata: { zone: 'A' },
      })),
    } as unknown as Repository<Resource>;

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
      resourceRepository as Repository<Resource>,
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
    expect(results).toEqual([
      {
        topic: 'devices/abc/state',
        payload: { on: true },
        resource: { id: 1, name: 'Resource 1', type: ResourceType.Machine, metadata: { zone: 'A' } },
      },
    ]);
    expect(mqttClientService.subscribe).toHaveBeenCalledWith(7, 'devices/+/state', undefined);
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
