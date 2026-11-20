import { ResourceFlowsExecutorService } from '../resource-flows-executor.service';
import { FlowLogRecorderService } from '../../logs/flow-log-recorder.service';
import { Logger } from '@nestjs/common';
import type { TransactionScope, UnitOfWork } from '../../../../database/unit-of-work';
import { createFakeFlowTriggerStore } from './fake-flow-trigger-store.test-fixture';
import { MqttClientService } from '../../../../mqtt/mqtt-client.service';
import { ResourceUsageService } from '../../../usage/sessions/resource-usage.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceHealthService } from '../../../health/resource-health.service';
import { ResourceFlowVariablesService } from '../../variables/resource-flow-variables.service';
import { CronTimer } from '../../../../metrics/instrumentation/cron/cron.helper';
import { FlowTimer } from '../../../../metrics/instrumentation/flow/flow.helper';
import { CompanionGatewayService } from '../../../../companion/companion-gateway.service';
import type { FlowExecutionTestScope as ResourceFlowsExecutorServiceRunFlowTestScope } from './flow-test-scope.test-fixture';
const transactionScope: TransactionScope = { isOpen: true, afterCommit: () => undefined };

export function resetTestFixture(scope: ResourceFlowsExecutorServiceRunFlowTestScope) {
  jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

  scope.nodesById = {};
  scope.initialNodes = [];
  scope.edgesBySourceAndHandle = {};

  // The store answers from the scope's nodes and edges; specs assert on its jest mocks.
  scope.flowStore = createFakeFlowTriggerStore(scope);

  scope.flowLogs = new FlowLogRecorderService();

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

  scope.billingItems = { addToPendingBill: jest.fn().mockResolvedValue(true) };
  scope.unitOfWork = {
    run: jest.fn(async (work: (scope: TransactionScope) => Promise<unknown>) => work(transactionScope)),
    current: jest.fn(),
  };

  scope.operatingIntervals = { transition: jest.fn().mockResolvedValue(null) };
  scope.service = new ResourceFlowsExecutorService(
    scope.flowStore,
    scope.flowLogs,
    scope.mqttClientService,
    scope.billingItems,
    scope.unitOfWork as unknown as UnitOfWork,
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
