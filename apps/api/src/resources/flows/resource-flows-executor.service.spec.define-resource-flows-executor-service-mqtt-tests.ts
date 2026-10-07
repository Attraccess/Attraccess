import { ResourceFlowsExecutorService } from './resource-flows-executor.service';
import { FlowLogRecorderService } from './flow-log-recorder.service';
import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  Resource,
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceFlowEdge,
  BillingTransactionItem,
  ResourceType,
} from '@attraccess/database-entities';
import { MqttClientService } from '../../mqtt/mqtt-client.service';
import { ResourceUsageService } from '../usage/resourceUsage.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceHealthService } from '../health/resource-health.service';
import { ResourceFlowVariablesService } from './resource-flow-variables.service';
import { CronTimer } from '../../metrics/instrumentation/cron/cron.helper';
import { FlowTimer } from '../../metrics/instrumentation/flow/flow.helper';
import { CompanionGatewayService } from '../../companion/companion-gateway.service';
import { registerResourceFlowsExecutorServiceMqttMatchesInputMqttMessageReceivedNodesUsingWildcards } from './resource-flows-executor.service.resource-flows-executor-service-mqtt-matches-input-mqtt-message-received-nodes-using-wildcards.test-cases';
import { registerResourceFlowsExecutorServiceMqttProcessingMqttWaitForMessageResolvesWithTopicPayloadBeforeTimeout } from './resource-flows-executor.service.resource-flows-executor-service-mqtt-processing-mqtt-wait-for-message-resolves-with-topic-payload-before-timeout.test-cases';
import { registerResourceFlowsExecutorServiceMqttProcessingMqttWaitForMessageTimesOutAndThrowsError } from './resource-flows-executor.service.resource-flows-executor-service-mqtt-processing-mqtt-wait-for-message-times-out-and-throws-error.test-cases';
import { registerResourceFlowsExecutorServiceMqttRecordsMqttContextWhenPublishingRejectsWithoutAnErrorMessage } from './resource-flows-executor.service.resource-flows-executor-service-mqtt-records-mqtt-context-when-publishing-rejects-without-an-error-message.test-cases';
import { createNode } from './resource-flows-executor.service.spec.create-node';

export function defineResourceFlowsExecutorServiceMqttTests() {
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
      { report: jest.fn() } as never,
    );
  });
  registerResourceFlowsExecutorServiceMqttMatchesInputMqttMessageReceivedNodesUsingWildcards(scope);

  registerResourceFlowsExecutorServiceMqttProcessingMqttWaitForMessageResolvesWithTopicPayloadBeforeTimeout(scope);

  registerResourceFlowsExecutorServiceMqttProcessingMqttWaitForMessageTimesOutAndThrowsError(scope);

  registerResourceFlowsExecutorServiceMqttRecordsMqttContextWhenPublishingRejectsWithoutAnErrorMessage(scope);

  return scope;
}
