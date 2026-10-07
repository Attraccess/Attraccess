import {
  BillingTransactionItem,
  Resource,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceType,
} from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { CompanionGatewayService } from '../../companion/companion-gateway.service';
import { CronTimer } from '../../metrics/instrumentation/cron/cron.helper';
import { FlowTimer } from '../../metrics/instrumentation/flow/flow.helper';
import { MqttClientService } from '../../mqtt/mqtt-client.service';
import { ResourceHealthService } from '../health/resource-health.service';
import { ResourceUsageService } from '../usage/resourceUsage.service';
import { FlowLogRecorderService } from './flow-log-recorder.service';
import { ResourceFlowVariablesService } from './resource-flow-variables.service';
import { ResourceFlowsExecutorService } from './resource-flows-executor.service';

jest.mock('axios');

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
export function registerResourceFlowsExecutorServiceMqttFixture() {
  let service: ResourceFlowsExecutorService;

  let flowNodeRepository: Partial<Repository<ResourceFlowNode>>;

  let flowEdgeRepository: Partial<Repository<ResourceFlowEdge>>;

  let flowLogs: FlowLogRecorderService;

  let resourceRepository: Partial<Repository<Resource>>;

  let mqttClientService: MqttClientService;

  let resourceUsageService: ResourceUsageService;

  let eventEmitter: EventEmitter2;

  let resourceHealthService: ResourceHealthService;

  let variablesService: ResourceFlowVariablesService;

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

    flowLogs = new FlowLogRecorderService();

    resourceRepository = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findOne: jest.fn(async ({ where }: any) => ({
        id: where?.id ?? 1,
        name: `Resource ${where?.id ?? 1}`,
        type: ResourceType.Machine,
        metadata: { zone: 'A' },
      })),
    } as unknown as Repository<Resource>;

    mqttClientService = {
      publish: jest.fn(async () => undefined),
      subscribe: jest.fn(async () => undefined),
    } as unknown as MqttClientService;
    resourceUsageService = {
      logger: new Logger(ResourceUsageService.name),
      getActiveSession: jest.fn().mockResolvedValue({ id: 'ru-1' }),
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
      resourceRepository as Repository<Resource>,
      flowLogs,
      mqttClientService,
      resourceUsageService,
      billingItemRepoMock,
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
  });
  return {
    get createNode() {
      return createNode;
    },
    get service() {
      return service;
    },
    get flowNodeRepository() {
      return flowNodeRepository;
    },
    get flowEdgeRepository() {
      return flowEdgeRepository;
    },
    get flowLogs() {
      return flowLogs;
    },
    get resourceRepository() {
      return resourceRepository;
    },
    get mqttClientService() {
      return mqttClientService;
    },
    get resourceUsageService() {
      return resourceUsageService;
    },
    get eventEmitter() {
      return eventEmitter;
    },
    get resourceHealthService() {
      return resourceHealthService;
    },
    get variablesService() {
      return variablesService;
    },
    get nodesById() {
      return nodesById;
    },
    get initialNodes() {
      return initialNodes;
    },
    get edgesBySourceAndHandle() {
      return edgesBySourceAndHandle;
    },
    set nodesById(value: typeof nodesById) {
      nodesById = value;
    },
    set initialNodes(value: typeof initialNodes) {
      initialNodes = value;
    },
    set edgesBySourceAndHandle(value: typeof edgesBySourceAndHandle) {
      edgesBySourceAndHandle = value;
    },
  };
}
