import { ResourceFlowsExecutorService } from '../resource-flows-executor.service';
import { FlowLogRecorderService } from '../../logs/flow-log-recorder.service';
import { Logger } from '@nestjs/common';
import { FindOperator, Repository, SelectQueryBuilder } from 'typeorm';
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
import type { ResourceFlowsExecutorServiceRunFlowTestScope } from '../resource-flows-executor.service.spec';
// Mirrors `flowId: IsNull()` / `flowId: <id>` / `resourceId: <id>` where clauses on in-memory rows.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function matchesFlowId(row: { flowId?: number | null }, flowId: any): boolean {
  if (flowId === undefined || row.flowId === undefined) return true;
  if (flowId instanceof FindOperator) return flowId.type === 'isNull' ? row.flowId === null : true;
  return row.flowId === flowId;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function matchesOwner(row: { flowId?: number | null; resourceId?: number | null }, where: any): boolean {
  if (!matchesFlowId(row, where.flowId)) return false;
  return where.resourceId === undefined || row.resourceId === undefined || row.resourceId === where.resourceId;
}

export function resetTestFixture(scope: ResourceFlowsExecutorServiceRunFlowTestScope) {
  jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

  scope.nodesById = {};
  scope.initialNodes = [];
  scope.edgesBySourceAndHandle = {};

  // Answers the plugin trigger page query (left join on the flow) from `initialNodes`; other queries find nothing.
  const createQueryBuilder = () => {
    const params: Record<string, unknown> = {};
    let joinsFlow = false;
    let limit: number | undefined;
    const builder = {
      innerJoin: jest.fn(() => builder),
      leftJoin: jest.fn(() => {
        joinsFlow = true;
        return builder;
      }),
      where: jest.fn((_sql: string, values?: Record<string, unknown>) => {
        Object.assign(params, values);
        return builder;
      }),
      andWhere: jest.fn((_sql: string, values?: Record<string, unknown>) => {
        Object.assign(params, values);
        return builder;
      }),
      orderBy: jest.fn(() => builder),
      limit: jest.fn((value: number) => {
        limit = value;
        return builder;
      }),
      distinct: jest.fn(() => builder),
      getMany: jest.fn(async () => {
        if (!joinsFlow) return [];
        return scope.initialNodes
          .filter((node) => node.type === params.type)
          .filter((node) => params.lastId === undefined || node.id > (params.lastId as string))
          .filter((node) => (node.flowId ?? null) === null || (node.flow?.enabled ?? true) === params.enabled)
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
          .slice(0, limit);
      }),
    };
    return builder as unknown as SelectQueryBuilder<ResourceFlowNode>;
  };

  scope.flowNodeRepository = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    find: jest.fn(async ({ where, take }: any) => {
      // `where` may be a list of alternatives (resource flow nodes or nodes of enabled global flows).
      const clauses = Array.isArray(where) ? where : [where || {}];
      type Clause = {
        resourceId?: number;
        type?: string;
        id?: { _value: string };
        flowId?: unknown;
        flow?: { enabled: boolean };
      };
      const matches = (node: ResourceFlowNode, clause: Clause) => {
        const { resourceId, type, id, flowId, flow } = clause;
        if (type !== undefined && node.type !== type) return false;
        if (resourceId !== undefined && node.resourceId !== resourceId) return false;
        if (id !== undefined && !(node.id > id._value)) return false;
        if (!matchesFlowId(node, flowId)) return false;
        if (flow !== undefined && ((node.flowId ?? null) === null || (node.flow?.enabled ?? true) !== flow.enabled)) {
          return false;
        }
        return true;
      };
      const nodes = scope.initialNodes.filter((node) => clauses.some((clause: Clause) => matches(node, clause)));
      return take === undefined ? nodes : nodes.slice(0, take);
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findOne: jest.fn(async ({ where }: any) => {
      const node = scope.nodesById[where.id];
      return node && matchesOwner(node, where) ? node : null;
    }),
    createQueryBuilder: jest.fn(createQueryBuilder),
  };

  scope.flowEdgeRepository = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    find: jest.fn(async ({ where }: any) => {
      const key = `${where.source}|${where.sourceHandle ?? ''}`;
      // Edges without owner fields belong to whatever canvas asks for them.
      return (scope.edgesBySourceAndHandle[key] ?? []).filter((edge) => matchesOwner(edge, where));
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
    getActiveSessionsForResource: jest.fn().mockResolvedValue([{ id: 'ru-1' }]),
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
  );
  scope.service.attachUsage(scope.resourceUsageService);
  scope.service.attachMetering({ report: jest.fn() } as never);
}
