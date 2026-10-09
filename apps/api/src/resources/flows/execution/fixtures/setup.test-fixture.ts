import { ResourceFlowsExecutorService } from '../resource-flows-executor.service';
import { FlowLogRecorderService } from '../../logs/flow-log-recorder.service';
import { Logger } from '@nestjs/common';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  Resource,
  ResourceFlowNode,
  ResourceFlowEdge,
  BillingTransactionItem,
  ResourceType,
} from '@attraccess/database-entities';
import { MqttClientService } from '../../../../mqtt/mqtt-client.service';
import { ResourceUsageService } from '../../../usage/sessions/resource-usage.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceHealthService } from '../../../health/resource-health.service';
import { ResourceFlowVariablesService } from '../../variables/resource-flow-variables.service';
import { CronTimer } from '../../../../metrics/instrumentation/cron/cron.helper';
import { FlowTimer } from '../../../../metrics/instrumentation/flow/flow.helper';
import { CompanionGatewayService } from '../../../../companion/companion-gateway.service';
import { ResourceFlowsExecutorServiceRunFlowTestScope } from '../resource-flows-executor.service.spec';
export function resetTestFixture(scope: ResourceFlowsExecutorServiceRunFlowTestScope) {
  jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

  scope.nodesById = {};
  scope.initialNodes = [];
  scope.edgesBySourceAndHandle = {};

  const defaultQueryBuilder = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    distinct: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  } as unknown as SelectQueryBuilder<ResourceFlowNode>;

  scope.flowNodeRepository = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    find: jest.fn(async ({ where, take }: any) => {
      const { resourceId, type, id } = where || {};
      const nodes = scope.initialNodes.filter((node) => {
        const isAfterLastId = id === undefined || node.id > id._value;
        return node.type === type && (resourceId === undefined || node.resourceId === resourceId) && isAfterLastId;
      });
      return take === undefined ? nodes : nodes.slice(0, take);
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findOne: jest.fn(async ({ where }: any) => {
      return scope.nodesById[where.id] ?? null;
    }),
    createQueryBuilder: jest.fn(() => defaultQueryBuilder),
  };

  scope.flowEdgeRepository = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    find: jest.fn(async ({ where }: any) => {
      const key = `${where.source}|${where.sourceHandle ?? ''}`;
      return scope.edgesBySourceAndHandle[key] ?? [];
    }),
  } as unknown as Repository<ResourceFlowEdge>;

  scope.flowLogs = new FlowLogRecorderService();

  scope.resourceRepository = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findOne: jest.fn(async ({ where }: any) => ({
      id: where?.id ?? 1,
      name: `Resource ${where?.id ?? 1}`,
      type: ResourceType.Machine,
      metadata: { zone: 'A' },
    })),
  } as unknown as Repository<Resource>;

  scope.mqttClientService = {
    publish: jest.fn(async () => undefined),
    subscribe: jest.fn(async () => undefined),
  } as unknown as MqttClientService;
  scope.resourceUsageService = {
    logger: new Logger(ResourceUsageService.name),
    getActiveSession: jest.fn().mockResolvedValue({ id: 'ru-1' }),
    stageLifecycleBillingItem: jest.fn().mockResolvedValue(undefined),
  } as unknown as ResourceUsageService;

  scope.eventEmitter = new EventEmitter2();

  scope.resourceHealthService = {
    reportHealth: jest.fn(async () => undefined),
    isResourceUnhealthy: jest.fn(async () => false),
    listForResource: jest.fn(async () => []),
    getSummary: jest.fn(async () => ({ resourceId: 1, isHealthy: true, entries: [], unhealthyEntries: [] })),
  } as unknown as ResourceHealthService;

  scope.variablesService = {
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
      transaction: jest.fn(async (work) => work(billingItemRepoMock.manager)),
    },
  } as unknown as Repository<BillingTransactionItem>;

  scope.operatingIntervals = { transition: jest.fn().mockResolvedValue(null) };
  scope.service = new ResourceFlowsExecutorService(
    scope.flowNodeRepository as Repository<ResourceFlowNode>,
    scope.flowEdgeRepository as unknown as Repository<ResourceFlowEdge>,
    scope.resourceRepository as Repository<Resource>,
    scope.flowLogs,
    scope.mqttClientService,
    scope.resourceUsageService,
    billingItemRepoMock,
    scope.eventEmitter,
    scope.resourceHealthService,
    scope.variablesService,
    { time: (_n, fn) => fn() } as unknown as CronTimer,
    {
      timeFlow: <T>(_t: string, fn: () => Promise<T>) => fn(),
      timeNode: <T>(_n: string, fn: () => Promise<T>) => fn(),
    } as unknown as FlowTimer,
    {
      sendLockCommand: jest.fn(() => true),
      sendUnlockCommand: jest.fn(() => true),
    } as unknown as CompanionGatewayService,
    scope.operatingIntervals as never,
    { report: jest.fn() } as never,
  );
}
