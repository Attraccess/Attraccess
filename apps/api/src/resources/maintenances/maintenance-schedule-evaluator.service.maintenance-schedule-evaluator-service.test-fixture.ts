import { MaintenanceScheduleRecord, ResourceMaintenanceScheduleTriggerType } from '@attraccess/application-models';
import { Test, TestingModule } from '@nestjs/testing';
import { CronTimer } from '../../metrics/instrumentation/cron/cron.helper';
import { MetricsService } from '../../metrics/metrics.service';
import { ResourceOperatingAttributionService } from '../operating-intervals/resource-operating-attribution.service';
import { ResourceSessionStartedEvent } from '../usage/events/resource-usage.events';
import { MaintenanceScheduleEvaluatorService } from './maintenance-schedule-evaluator.service';
import { ResourceMaintenanceService } from './maintenance.service';
import {
  MAINTENANCE_EVALUATION_STORE,
  MaintenanceEvaluationStore,
  MaintenanceEvaluationView,
  ServiceCycleRequest,
} from './maintenance-evaluation-store.port';

// Usage event for the onResourceUsage debounce tests; the handler only reads the resource id.
const usageEndedEvent = (usage: Record<string, unknown>) => new ResourceSessionStartedEvent(usage as never);

/** A schedule record with the trigger configuration the tests ask for. */
export const scheduleRecord = (overrides: Partial<MaintenanceScheduleRecord> & { id: number; resourceId: number }) =>
  ({
    enabled: true,
    triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
    usageHoursConfig: null,
    usageCountConfig: null,
    timeIntervalConfig: null,
    ...overrides,
  }) as MaintenanceScheduleRecord;

type Mocked<T> = { [K in keyof T]: T[K] extends (...args: infer A) => infer R ? jest.Mock<R, A> : T[K] };

export function registerMaintenanceScheduleEvaluatorServiceFixture() {
  let service: MaintenanceScheduleEvaluatorService;

  let maintenanceService: ResourceMaintenanceService;

  let store: Mocked<MaintenanceEvaluationStore>;

  let view: Mocked<MaintenanceEvaluationView>;

  let currentView: Mocked<MaintenanceEvaluationView>;

  let operatingAttribution: { getDurationsForWindows: jest.Mock };

  const resourceId = 1;

  const scheduleId = 10;

  const baselineDate = new Date('2025-01-01T00:00:00.000Z');

  const fakeView = (context: object | undefined): Mocked<MaintenanceEvaluationView> => ({
    context,
    enabledSchedules: jest.fn().mockResolvedValue([]),
    baselineDate: jest.fn().mockResolvedValue(baselineDate),
    completedSessionCountSince: jest.fn().mockResolvedValue(0),
    durationFingerprint: jest.fn().mockResolvedValue(''),
    atomically: jest.fn(async (_name: string, work: () => Promise<unknown>) => work()) as never,
  });

  beforeEach(async () => {
    operatingAttribution = { getDurationsForWindows: jest.fn().mockResolvedValue(new Map()) };
    view = fakeView({ transaction: true });
    currentView = fakeView(undefined);
    store = {
      snapshotReads: false,
      current: jest.fn(() => currentView),
      hasEnabledSchedules: jest.fn().mockResolvedValue(true),
      listEnabledSchedules: jest.fn().mockResolvedValue([]),
      findResourceCreatedAt: jest.fn().mockResolvedValue(new Map([[resourceId, baselineDate]])),
      // No completed maintenance and no running one: every cycle starts at the resource's creation.
      loadServiceCycleStates: jest.fn(async (requests: ServiceCycleRequest[]) =>
        requests.map((request) => ({
          resourceId: request.resourceId,
          scheduleId: request.scheduleId,
          baseline: request.createdAt,
          hasActiveMaintenance: false,
          completedSessions: 0,
        })),
      ),
      inSnapshot: jest.fn(async (work: (v: MaintenanceEvaluationView) => Promise<unknown>) => work(view)),
      inTransaction: jest.fn(async (work: (v: MaintenanceEvaluationView) => Promise<unknown>) => work(view)),
      close: jest.fn().mockResolvedValue(undefined),
    } as never;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceScheduleEvaluatorService,
        { provide: ResourceOperatingAttributionService, useValue: operatingAttribution },
        { provide: MAINTENANCE_EVALUATION_STORE, useValue: store },
        {
          provide: ResourceMaintenanceService,
          useValue: {
            hasActiveMaintenance: jest.fn().mockResolvedValue(false),
            createMaintenanceFromSchedule: jest.fn().mockResolvedValue({ id: 1 }),
            emitScheduledMaintenanceCreated: jest.fn(),
          },
        },
        { provide: CronTimer, useValue: { time: <T>(_n: string, fn: () => Promise<T>) => fn() } },
        { provide: MetricsService, useValue: { maintenanceUsageQueryWindowDays: { observe: jest.fn() } } },
      ],
    }).compile();

    service = module.get<MaintenanceScheduleEvaluatorService>(MaintenanceScheduleEvaluatorService);
    maintenanceService = module.get<ResourceMaintenanceService>(ResourceMaintenanceService);
  });
  return {
    get usageEndedEvent() {
      return usageEndedEvent;
    },
    get service() {
      return service;
    },
    get maintenanceService() {
      return maintenanceService;
    },
    get store() {
      return store;
    },
    get view() {
      return view;
    },
    get currentView() {
      return currentView;
    },
    get operatingAttribution() {
      return operatingAttribution;
    },
    get resourceId() {
      return resourceId;
    },
    get scheduleId() {
      return scheduleId;
    },
    get baselineDate() {
      return baselineDate;
    },
  };
}
