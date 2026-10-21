import { operationTransactionsFake } from '../../../../database/testing/operation-transactions.test-fixture';
import { billingOperationsFake } from '../../../../billing/charges/fixtures/operations.test-fixture';
import { BILLING_OPERATIONS } from '../../../../billing/persistence/port';
import { FLOW_EXECUTION_READS } from '../../persistence/port';
import { ResourceFlowsExecutorService } from '../resource-flows-executor.service';
import { FlowLogRecorderService } from '../../logs/flow-log-recorder.service';
import { Logger } from '@nestjs/common';
import { Resource, ResourceFlowEdge, ResourceFlowNodeType, ResourceType } from '@attraccess/application-models';
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

  const nodesOfType = (type: ResourceFlowNodeType, resourceId?: number) =>
    scope.initialNodes.filter(
      (node) => node.type === type && (resourceId === undefined || node.resourceId === resourceId),
    );
  scope.persistence = {
    resource: jest.fn(
      async (id) =>
        ({ id, name: `Resource ${id}`, type: ResourceType.Machine, metadata: { zone: 'A' } }) as unknown as Resource,
    ),
    button: jest.fn(async (resourceId, id) =>
      scope.nodesById[id]?.resourceId === resourceId ? scope.nodesById[id] : null,
    ),
    triggers: jest.fn(async (resourceId, type) => nodesOfType(type, resourceId)),
    outgoingEdges: jest.fn(
      async (id, handle) => (scope.edgesBySourceAndHandle[`${id}|${handle ?? ''}`] as ResourceFlowEdge[]) ?? [],
    ),
    node: jest.fn(async (id) => scope.nodesById[id] ?? null),
  };
  scope.events = {
    nodesByType: jest.fn(async (type) => nodesOfType(type)),
    pageNodesByType: jest.fn(async (type, afterId, limit) =>
      nodesOfType(type)
        .filter((node) => afterId === undefined || node.id > afterId)
        .slice(0, limit),
    ),
    activeInactivityNodes: jest.fn().mockResolvedValue([]),
  };
  scope.flowLogs = new FlowLogRecorderService();

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

  const transactionDriver = operationTransactionsFake();
  transactionDriver.bind(FLOW_EXECUTION_READS, scope.persistence);
  const billing = billingOperationsFake();
  billing.pendingUsageTransaction.mockResolvedValue({ id: 1, resourceUsageId: 'ru-1' } as never);
  transactionDriver.bind(BILLING_OPERATIONS, billing);
  scope.operatingIntervals = { transition: jest.fn().mockResolvedValue(null) };
  scope.service = new ResourceFlowsExecutorService(
    scope.persistence,
    transactionDriver.transactions,
    scope.flowLogs,
    scope.mqttClientService,
    scope.resourceUsageService,
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
    scope.events,
  );
}
