import {
  Resource,
  ResourceMaintenance,
  ResourceMaintenanceSchedule,
  ResourceUsage,
} from '@attraccess/database-entities';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CronTimer } from '../../metrics/instrumentation/cron/cron.helper';
import { MetricsService } from '../../metrics/metrics.service';
import { ResourceOperatingAttributionService } from '../operating-intervals/resource-operating-attribution.service';
import { ResourceSessionStartedEvent } from '../usage/events/resource-usage.events';
import { MaintenanceScheduleEvaluatorService } from './maintenance-schedule-evaluator.service';
import { ResourceMaintenanceService } from './maintenance.service';

// emitUsageEvent() fires ResourceSessionStartedEvent on session end too, with endTime set.
const usageEndedEvent = (usage: Record<string, unknown>) => new ResourceSessionStartedEvent(usage as never);

const createQueryBuilderMock = () => ({
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  groupBy: jest.fn().mockReturnThis(),
  addGroupBy: jest.fn().mockReturnThis(),
  getOne: jest.fn(),
  getRawOne: jest.fn(),
  getRawMany: jest.fn().mockResolvedValue([]),
  getCount: jest.fn(),
});
export function registerMaintenanceScheduleEvaluatorServiceFixture() {
  let service: MaintenanceScheduleEvaluatorService;

  let maintenanceService: ResourceMaintenanceService;

  let scheduleRepository: Repository<ResourceMaintenanceSchedule>;

  let maintenanceRepository: Repository<ResourceMaintenance>;

  let resourceRepository: Repository<Resource>;

  let usageRepository: Repository<ResourceUsage>;

  let operatingAttribution: { getDurationsForWindows: jest.Mock };

  const resourceId = 1;

  const scheduleId = 10;

  const baselineDate = new Date('2025-01-01T00:00:00.000Z');

  beforeEach(async () => {
    const qb = createQueryBuilderMock();
    operatingAttribution = { getDurationsForWindows: jest.fn().mockResolvedValue(new Map()) };
    const scheduleRepoMock = {
      find: jest.fn(),
      findOne: jest.fn(),
      manager: {
        transaction: jest.fn(async (cb: (em: { getRepository: (entity: unknown) => unknown }) => Promise<unknown>) => {
          const transactionalEntityManager = {
            getRepository: (entity: unknown) => {
              if (entity === ResourceMaintenanceSchedule) return scheduleRepoMock;
              if (entity === ResourceMaintenance) return maintenanceRepository;
              if (entity === Resource) return resourceRepository;
              if (entity === ResourceUsage) return usageRepository;
              return {};
            },
            query: jest.fn().mockResolvedValue([]),
          };
          return cb(transactionalEntityManager);
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceScheduleEvaluatorService,
        { provide: ResourceOperatingAttributionService, useValue: operatingAttribution },
        {
          provide: getRepositoryToken(ResourceMaintenanceSchedule),
          useValue: scheduleRepoMock,
        },
        {
          provide: getRepositoryToken(ResourceMaintenance),
          useValue: {
            metadata: { tableName: 'resource_maintenance' },
            createQueryBuilder: jest.fn(() => ({ ...qb, getOne: jest.fn().mockResolvedValue(null) })),
          },
        },
        {
          provide: getRepositoryToken(Resource),
          useValue: {
            findOne: jest.fn().mockResolvedValue({ id: resourceId, createdAt: baselineDate }),
            find: jest.fn().mockResolvedValue([{ id: resourceId, createdAt: baselineDate }]),
          },
        },
        {
          provide: getRepositoryToken(ResourceUsage),
          useValue: {
            metadata: { tableName: 'resource_usage' },
            query: jest.fn().mockResolvedValue([]),
            createQueryBuilder: jest.fn(() => ({
              ...createQueryBuilderMock(),
              getRawOne: jest.fn().mockResolvedValue({ total: '0' }),
              getCount: jest.fn().mockResolvedValue(0),
            })),
          },
        },
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
    scheduleRepository = module.get(getRepositoryToken(ResourceMaintenanceSchedule));
    maintenanceRepository = module.get(getRepositoryToken(ResourceMaintenance));
    resourceRepository = module.get(getRepositoryToken(Resource));
    usageRepository = module.get(getRepositoryToken(ResourceUsage));
  });
  return {
    get usageEndedEvent() {
      return usageEndedEvent;
    },
    get createQueryBuilderMock() {
      return createQueryBuilderMock;
    },
    get service() {
      return service;
    },
    get maintenanceService() {
      return maintenanceService;
    },
    get scheduleRepository() {
      return scheduleRepository;
    },
    get maintenanceRepository() {
      return maintenanceRepository;
    },
    get resourceRepository() {
      return resourceRepository;
    },
    get usageRepository() {
      return usageRepository;
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
