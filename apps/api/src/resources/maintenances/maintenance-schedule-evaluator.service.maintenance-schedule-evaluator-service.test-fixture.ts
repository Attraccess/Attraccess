import { ResourceMaintenanceSchedule } from '@attraccess/application-models';
import { operationTransactionsFake } from '../../database/testing/operation-transactions.test-fixture';
import { MAINTENANCE_EVALUATION_OPERATIONS, MaintenanceEvaluationPersistence } from './persistence/port';
import { ResourceOperatingAttributionService } from '../operating-intervals/resource-operating-attribution.service';
import { ResourceSessionStartedEvent } from '../usage/events/resource-usage.events';
import { MaintenanceScheduleEvaluatorService } from './maintenance-schedule-evaluator.service';
import { ResourceMaintenanceService } from './maintenance.service';
import { CronTimer } from '../../metrics/instrumentation/cron/cron.helper';
import { MetricsService } from '../../metrics/metrics.service';

const usageEndedEvent = (usage: Record<string, unknown>) => new ResourceSessionStartedEvent(usage as never);

export function registerMaintenanceScheduleEvaluatorServiceFixture() {
  const resourceId = 1;
  const scheduleId = 10;
  const baselineDate = new Date('2025-01-01T00:00:00.000Z');
  let service: MaintenanceScheduleEvaluatorService;
  let persistence: jest.Mocked<MaintenanceEvaluationPersistence>;
  let transactionDriver: ReturnType<typeof operationTransactionsFake>;
  let operatingAttribution: { getDurationsForWindows: jest.Mock };
  let maintenanceService: jest.Mocked<
    Pick<
      ResourceMaintenanceService,
      'hasActiveMaintenance' | 'createMaintenanceFromSchedule' | 'emitScheduledMaintenanceCreated'
    >
  >;

  beforeEach(() => {
    persistence = {
      hasEnabledSchedules: jest.fn().mockResolvedValue(true),
      enabledSchedules: jest.fn<Promise<ResourceMaintenanceSchedule[]>, [number?]>().mockResolvedValue([]),
      resourceCreationDate: jest.fn().mockResolvedValue(baselineDate),
      resourceCreationDates: jest.fn().mockResolvedValue([{ id: resourceId, createdAt: baselineDate }]),
      lastCompleted: jest.fn().mockResolvedValue(null),
      usageCount: jest.fn().mockResolvedValue(0),
      scheduleState: jest.fn().mockResolvedValue([]),
      attemptCreation: jest.fn(async (_id, create) => create()),
    };
    transactionDriver = operationTransactionsFake();
    transactionDriver.bind(MAINTENANCE_EVALUATION_OPERATIONS, persistence);
    operatingAttribution = { getDurationsForWindows: jest.fn().mockResolvedValue(new Map()) };
    maintenanceService = {
      hasActiveMaintenance: jest.fn().mockResolvedValue(false),
      createMaintenanceFromSchedule: jest.fn().mockResolvedValue({ id: 1 }),
      emitScheduledMaintenanceCreated: jest.fn(),
    };
    service = new MaintenanceScheduleEvaluatorService(
      persistence,
      transactionDriver.transactions,
      maintenanceService as unknown as ResourceMaintenanceService,
      { time: (_name, work) => work() } as CronTimer,
      { maintenanceUsageQueryWindowDays: { observe: jest.fn() } } as unknown as MetricsService,
      operatingAttribution as unknown as ResourceOperatingAttributionService,
    );
  });
  return {
    usageEndedEvent,
    resourceId,
    scheduleId,
    baselineDate,
    get service() {
      return service;
    },
    get persistence() {
      return persistence;
    },
    get transactionDriver() {
      return transactionDriver;
    },
    get maintenanceService() {
      return maintenanceService;
    },
    get operatingAttribution() {
      return operatingAttribution;
    },
  };
}
