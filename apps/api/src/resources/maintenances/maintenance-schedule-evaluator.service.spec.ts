import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaintenanceScheduleEvaluatorService, formatDbDate } from './maintenance-schedule-evaluator.service';
import { ResourceMaintenanceService } from './maintenance.service';
import { ResourceMaintenanceChangedEvent } from './events/resource-maintenance-changed.event';
import { ResourceUsageSessionEndedEvent } from '../usage/events/resource-usage.events';
import { CronTimer } from '../../metrics/instrumentation/cron/cron.helper';
import { MetricsService } from '../../metrics/metrics.service';
import {
  ResourceMaintenanceSchedule,
  ResourceMaintenance,
  Resource,
  ResourceUsage,
  ResourceMaintenanceScheduleTriggerType,
} from '@attraccess/database-entities';

const usageEndedEvent = (usage: Record<string, unknown>) =>
  new ResourceUsageSessionEndedEvent(usage as never, null);

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

describe('MaintenanceScheduleEvaluatorService', () => {
  let service: MaintenanceScheduleEvaluatorService;
  let maintenanceService: ResourceMaintenanceService;
  let scheduleRepository: Repository<ResourceMaintenanceSchedule>;
  let maintenanceRepository: Repository<ResourceMaintenance>;
  let resourceRepository: Repository<Resource>;
  let usageRepository: Repository<ResourceUsage>;

  const resourceId = 1;
  const scheduleId = 10;
  const baselineDate = new Date('2025-01-01T00:00:00.000Z');

  beforeEach(async () => {
    const qb = createQueryBuilderMock();

    const scheduleRepoMock = {
      find: jest.fn(),
      findOne: jest.fn(),
      manager: {
        transaction: jest.fn(async (cb: (em: { getRepository: (entity: unknown) => unknown }) => Promise<unknown>) => {
          const transactionalEntityManager = {
            getRepository: (entity: unknown) =>
              entity === ResourceMaintenanceSchedule ? scheduleRepoMock : {},
          };
          return cb(transactionalEntityManager);
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceScheduleEvaluatorService,
        {
          provide: getRepositoryToken(ResourceMaintenanceSchedule),
          useValue: scheduleRepoMock,
        },
        {
          provide: getRepositoryToken(ResourceMaintenance),
          useValue: {
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
          },
        },
        { provide: CronTimer, useValue: { time: <T,>(_n: string, fn: () => Promise<T>) => fn() } },
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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getBaselineDate', () => {
    it('should return resource createdAt when no previous maintenance for schedule', async () => {
      const result = await service.getBaselineDate(resourceId, scheduleId);
      expect(result).toEqual(baselineDate);
    });

    it('should return last maintenance endTime when exists', async () => {
      const lastEnd = new Date('2025-02-01T12:00:00.000Z');
      const mockQb = createQueryBuilderMock();
      mockQb.getOne.mockResolvedValue({ endTime: lastEnd });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(maintenanceRepository, 'createQueryBuilder').mockReturnValue(mockQb as any);

      const result = await service.getBaselineDate(resourceId, scheduleId);
      expect(result).toEqual(lastEnd);
    });
  });

  describe('evaluateResource', () => {
    it('should not create maintenance when resource has active maintenance', async () => {
      jest.spyOn(maintenanceService, 'hasActiveMaintenance').mockResolvedValue(true);
      jest.spyOn(scheduleRepository, 'find').mockResolvedValue([
        {
          id: scheduleId,
          resourceId,
          enabled: true,
          triggerType: 'USAGE_HOURS',
          usageHoursConfig: { duration: 1, unit: 'HOURS' as const },
        } as ResourceMaintenanceSchedule,
      ]);

      await service.evaluateResource(resourceId);

      expect(maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
    });

    it('should create maintenance when USAGE_HOURS threshold met and no active maintenance', async () => {
      jest.spyOn(scheduleRepository, 'find').mockResolvedValue([
        {
          id: scheduleId,
          resourceId,
          enabled: true,
          triggerType: 'USAGE_HOURS',
          usageHoursConfig: { duration: 1, unit: 'HOURS' as const },
          usageCountConfig: null,
          timeIntervalConfig: null,
        } as ResourceMaintenanceSchedule,
      ]);

      const usageQb = createQueryBuilderMock();
      usageQb.getRawOne.mockResolvedValue({ total: '120' }); // 120 minutes >= 60
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(usageRepository, 'createQueryBuilder').mockReturnValue(usageQb as any);

      await service.evaluateResource(resourceId);

      expect(maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledWith(
        resourceId,
        scheduleId,
        expect.any(String),
        expect.anything(),
      );
      const reason = (maintenanceService.createMaintenanceFromSchedule as jest.Mock).mock.calls[0][2];
      const parsed = JSON.parse(reason);
      expect(parsed.i18nKey).toBe('reason.auto.usageHoursHours');
      expect(parsed.details.duration).toBe(1);
    });

    it('should not create when USAGE_HOURS threshold not met', async () => {
      jest.spyOn(scheduleRepository, 'find').mockResolvedValue([
        {
          id: scheduleId,
          resourceId,
          enabled: true,
          triggerType: 'USAGE_HOURS',
          usageHoursConfig: { duration: 10, unit: 'HOURS' as const },
          usageCountConfig: null,
          timeIntervalConfig: null,
        } as ResourceMaintenanceSchedule,
      ]);

      const usageQb = createQueryBuilderMock();
      usageQb.getRawOne.mockResolvedValue({ total: '100' }); // 100 < 600 (10 hours)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(usageRepository, 'createQueryBuilder').mockReturnValue(usageQb as any);

      await service.evaluateResource(resourceId);

      expect(maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
    });

    it('should create when TIME_INTERVAL threshold due', async () => {
      const oldBaseline = new Date('2024-12-01T00:00:00.000Z');
      const mantQb = createQueryBuilderMock();
      mantQb.getOne.mockResolvedValue({ endTime: oldBaseline });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(maintenanceRepository, 'createQueryBuilder').mockReturnValue(mantQb as any);

      jest.spyOn(scheduleRepository, 'find').mockResolvedValue([
        {
          id: scheduleId,
          resourceId,
          enabled: true,
          triggerType: 'TIME_INTERVAL',
          usageHoursConfig: null,
          usageCountConfig: null,
          timeIntervalConfig: { duration: 30, unit: 'DAYS' },
        } as ResourceMaintenanceSchedule,
      ]);

      await service.evaluateResource(resourceId);

      expect(maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledWith(
        resourceId,
        scheduleId,
        expect.any(String),
        expect.anything(),
      );
      const reason = (maintenanceService.createMaintenanceFromSchedule as jest.Mock).mock.calls[0][2];
      const parsed = JSON.parse(reason);
      expect(parsed.i18nKey).toBe('reason.auto.timeIntervalDays');
      expect(parsed.details.duration).toBe(30);
    });

    it('should skip disabled schedules', async () => {
      jest.spyOn(scheduleRepository, 'find').mockResolvedValue([
        {
          id: scheduleId,
          resourceId,
          enabled: false,
          triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_HOURS,
          usageHoursConfig: { duration: 1, unit: 'MINUTES' as const },
        } as ResourceMaintenanceSchedule,
      ]);

      await service.evaluateResource(resourceId);

      expect(maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
    });
  });

  describe('evaluateAll', () => {
    it('should create maintenances for resources whose TIME_INTERVAL schedule is due', async () => {
      const oldCreatedAt = new Date('2024-01-01T00:00:00.000Z');

      // Two resources with TIME_INTERVAL schedules due (baseline is createdAt, > 30 days ago)
      jest.spyOn(scheduleRepository, 'find').mockResolvedValue([
        {
          id: scheduleId,
          resourceId: 1,
          enabled: true,
          triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
          usageHoursConfig: null,
          usageCountConfig: null,
          timeIntervalConfig: { duration: 30, unit: 'DAYS' },
        } as ResourceMaintenanceSchedule,
        {
          id: scheduleId + 1,
          resourceId: 2,
          enabled: true,
          triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
          usageHoursConfig: null,
          usageCountConfig: null,
          timeIntervalConfig: { duration: 30, unit: 'DAYS' },
        } as ResourceMaintenanceSchedule,
      ]);

      // No last-done maintenances, no active maintenances
      const maintenanceQb = createQueryBuilderMock();
      maintenanceQb.getRawMany.mockResolvedValue([]);
      jest.spyOn(maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      // Resources with old createdAt (> 30 days) so TIME_INTERVAL triggers
      jest.spyOn(resourceRepository, 'find').mockResolvedValue([
        { id: 1, createdAt: oldCreatedAt } as Resource,
        { id: 2, createdAt: oldCreatedAt } as Resource,
      ]);

      await service.evaluateAll();

      expect(maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledTimes(2);
      expect(maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledWith(
        1, scheduleId, expect.any(String), expect.anything(),
      );
      expect(maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledWith(
        2, scheduleId + 1, expect.any(String), expect.anything(),
      );
    });

    it('should not create maintenance when TIME_INTERVAL not yet due', async () => {
      // Schedule due in 30 days, resource created 1 day ago
      const recentCreatedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);

      jest.spyOn(scheduleRepository, 'find').mockResolvedValue([
        {
          id: scheduleId,
          resourceId: 1,
          enabled: true,
          triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
          usageHoursConfig: null,
          usageCountConfig: null,
          timeIntervalConfig: { duration: 30, unit: 'DAYS' },
        } as ResourceMaintenanceSchedule,
      ]);

      const maintenanceQb = createQueryBuilderMock();
      maintenanceQb.getRawMany.mockResolvedValue([]);
      jest.spyOn(maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      jest.spyOn(resourceRepository, 'find').mockResolvedValue([
        { id: 1, createdAt: recentCreatedAt } as Resource,
      ]);

      await service.evaluateAll();

      expect(maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
    });

    it('should skip resources that already have active maintenance', async () => {
      const oldCreatedAt = new Date('2024-01-01T00:00:00.000Z');

      jest.spyOn(scheduleRepository, 'find').mockResolvedValue([
        {
          id: scheduleId,
          resourceId: 1,
          enabled: true,
          triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
          usageHoursConfig: null,
          usageCountConfig: null,
          timeIntervalConfig: { duration: 30, unit: 'DAYS' },
        } as ResourceMaintenanceSchedule,
      ]);

      // Return active maintenance for this resource/schedule
      const maintenanceQb = createQueryBuilderMock();
      maintenanceQb.getRawMany
        .mockResolvedValueOnce([]) // first call: last done query
        .mockResolvedValueOnce([{ resourceId: 1, scheduleId }]); // second call: active query
      jest.spyOn(maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      jest.spyOn(resourceRepository, 'find').mockResolvedValue([
        { id: 1, createdAt: oldCreatedAt } as Resource,
      ]);

      await service.evaluateAll();

      expect(maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
    });

    it('should evaluate USAGE_HOURS using bulk-fetched usage data', async () => {
      const oldCreatedAt = new Date('2024-01-01T00:00:00.000Z');

      jest.spyOn(scheduleRepository, 'find').mockResolvedValue([
        {
          id: scheduleId,
          resourceId: 1,
          enabled: true,
          triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_HOURS,
          usageHoursConfig: { duration: 1, unit: 'HOURS' as const },
          usageCountConfig: null,
          timeIntervalConfig: null,
        } as ResourceMaintenanceSchedule,
      ]);

      // No last-done maintenances, no active maintenances — maintenance qb
      const maintenanceQb = createQueryBuilderMock();
      maintenanceQb.getRawMany.mockResolvedValue([]);
      jest.spyOn(maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      jest.spyOn(resourceRepository, 'find').mockResolvedValue([
        { id: 1, createdAt: oldCreatedAt } as Resource,
      ]);

      // SQL aggregation returns totalMinutes=120 (>= 60 threshold) and totalCount
      jest.spyOn(usageRepository, 'query').mockResolvedValue([
        { resourceId: 1, scheduleId, totalMinutes: '120', totalCount: '3' },
      ]);

      await service.evaluateAll();

      expect(maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledWith(
        1, scheduleId, expect.any(String), expect.anything(),
      );
    });

    it('should not create maintenance when USAGE_HOURS threshold not met in bulk data', async () => {
      const oldCreatedAt = new Date('2024-01-01T00:00:00.000Z');

      jest.spyOn(scheduleRepository, 'find').mockResolvedValue([
        {
          id: scheduleId,
          resourceId: 1,
          enabled: true,
          triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_HOURS,
          usageHoursConfig: { duration: 10, unit: 'HOURS' as const }, // 600 minutes threshold
          usageCountConfig: null,
          timeIntervalConfig: null,
        } as ResourceMaintenanceSchedule,
      ]);

      const maintenanceQb = createQueryBuilderMock();
      maintenanceQb.getRawMany.mockResolvedValue([]);
      jest.spyOn(maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      jest.spyOn(resourceRepository, 'find').mockResolvedValue([
        { id: 1, createdAt: oldCreatedAt } as Resource,
      ]);

      // 100 minutes < 600 minutes threshold
      jest.spyOn(usageRepository, 'query').mockResolvedValue([
        { resourceId: 1, scheduleId, totalMinutes: '100', totalCount: '2' },
      ]);

      await service.evaluateAll();

      expect(maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
    });

    it('should evaluate USAGE_COUNT using bulk-fetched usage data', async () => {
      const oldCreatedAt = new Date('2024-01-01T00:00:00.000Z');

      jest.spyOn(scheduleRepository, 'find').mockResolvedValue([
        {
          id: scheduleId,
          resourceId: 1,
          enabled: true,
          triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_COUNT,
          usageHoursConfig: null,
          usageCountConfig: { thresholdSessions: 5 },
          timeIntervalConfig: null,
        } as ResourceMaintenanceSchedule,
      ]);

      const maintenanceQb = createQueryBuilderMock();
      maintenanceQb.getRawMany.mockResolvedValue([]);
      jest.spyOn(maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      jest.spyOn(resourceRepository, 'find').mockResolvedValue([
        { id: 1, createdAt: oldCreatedAt } as Resource,
      ]);

      // SQL aggregation returns totalCount=7 (>= 5 threshold)
      jest.spyOn(usageRepository, 'query').mockResolvedValue([
        { resourceId: 1, scheduleId, totalMinutes: '0', totalCount: '7' },
      ]);

      await service.evaluateAll();

      expect(maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledWith(
        1, scheduleId, expect.any(String), expect.anything(),
      );
      const reason = (maintenanceService.createMaintenanceFromSchedule as jest.Mock).mock.calls[0][2];
      expect(JSON.parse(reason).i18nKey).toBe('reason.auto.usageCount');
    });

    it('should not create maintenance when USAGE_COUNT threshold not met in bulk data', async () => {
      const oldCreatedAt = new Date('2024-01-01T00:00:00.000Z');

      jest.spyOn(scheduleRepository, 'find').mockResolvedValue([
        {
          id: scheduleId,
          resourceId: 1,
          enabled: true,
          triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_COUNT,
          usageHoursConfig: null,
          usageCountConfig: { thresholdSessions: 10 },
          timeIntervalConfig: null,
        } as ResourceMaintenanceSchedule,
      ]);

      const maintenanceQb = createQueryBuilderMock();
      maintenanceQb.getRawMany.mockResolvedValue([]);
      jest.spyOn(maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      jest.spyOn(resourceRepository, 'find').mockResolvedValue([
        { id: 1, createdAt: oldCreatedAt } as Resource,
      ]);

      // 3 sessions < 10 threshold
      jest.spyOn(usageRepository, 'query').mockResolvedValue([
        { resourceId: 1, scheduleId, totalMinutes: '0', totalCount: '3' },
      ]);

      await service.evaluateAll();

      expect(maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
    });

    it('should evaluate each usage-based schedule against its own baseline, not a shared one', async () => {
      const otherScheduleId = scheduleId + 1;
      const resourceCreatedAt = new Date('2024-01-01T00:00:00.000Z');
      const recentlyServiced = new Date('2026-06-01T00:00:00.000Z');

      jest.spyOn(scheduleRepository, 'find').mockResolvedValue([
        // Never serviced -> baseline is resource createdAt, plenty of usage accumulated
        {
          id: scheduleId,
          resourceId: 1,
          enabled: true,
          triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_HOURS,
          usageHoursConfig: { duration: 10, unit: 'HOURS' as const }, // 600 min
          usageCountConfig: null,
          timeIntervalConfig: null,
        } as ResourceMaintenanceSchedule,
        // Serviced recently -> its own baseline, only a little usage since
        {
          id: otherScheduleId,
          resourceId: 1,
          enabled: true,
          triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_HOURS,
          usageHoursConfig: { duration: 10, unit: 'HOURS' as const },
          usageCountConfig: null,
          timeIntervalConfig: null,
        } as ResourceMaintenanceSchedule,
      ]);

      const maintenanceQb = createQueryBuilderMock();
      maintenanceQb.getRawMany
        .mockResolvedValueOnce([
          { resourceId: 1, scheduleId: otherScheduleId, lastEndTime: recentlyServiced.toISOString() },
        ])
        .mockResolvedValueOnce([]);
      jest.spyOn(maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      jest.spyOn(resourceRepository, 'find').mockResolvedValue([
        { id: 1, createdAt: resourceCreatedAt } as Resource,
      ]);

      // Same resource, different per-schedule windows: 900 min since createdAt, 30 min since service
      const querySpy = jest.spyOn(usageRepository, 'query').mockResolvedValue([
        { resourceId: 1, scheduleId, totalMinutes: '900', totalCount: '9' },
        { resourceId: 1, scheduleId: otherScheduleId, totalMinutes: '30', totalCount: '1' },
      ]);

      await service.evaluateAll();

      // Both schedules must be sent to SQL with their own baseline
      const params = querySpy.mock.calls[0][1] as unknown[];
      expect(params).toEqual([
        1, scheduleId, formatDbDate(resourceCreatedAt),
        1, otherScheduleId, formatDbDate(recentlyServiced),
      ]);

      // Only the never-serviced schedule crossed its threshold
      expect(maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledTimes(1);
      expect(maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledWith(
        1, scheduleId, expect.any(String), expect.anything(),
      );
    });

    it('should isolate failures so one bad schedule does not block the rest', async () => {
      jest.spyOn(scheduleRepository, 'find').mockResolvedValue([
        {
          id: scheduleId,
          resourceId: 1,
          enabled: true,
          triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
          usageHoursConfig: null,
          usageCountConfig: null,
          timeIntervalConfig: { duration: 1, unit: 'DAYS' },
        } as ResourceMaintenanceSchedule,
        {
          id: scheduleId + 1,
          resourceId: 2,
          enabled: true,
          triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
          usageHoursConfig: null,
          usageCountConfig: null,
          timeIntervalConfig: { duration: 1, unit: 'DAYS' },
        } as ResourceMaintenanceSchedule,
      ]);

      const maintenanceQb = createQueryBuilderMock();
      maintenanceQb.getRawMany.mockResolvedValue([]);
      jest.spyOn(maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      jest.spyOn(resourceRepository, 'find').mockResolvedValue([
        { id: 1, createdAt: new Date('2024-01-01T00:00:00.000Z') } as Resource,
        { id: 2, createdAt: new Date('2024-01-01T00:00:00.000Z') } as Resource,
      ]);

      jest
        .spyOn(maintenanceService, 'createMaintenanceFromSchedule')
        .mockRejectedValueOnce(new Error('resource vanished mid-run'))
        .mockResolvedValueOnce({ id: 2 } as ResourceMaintenance);

      await expect(service.evaluateAll()).resolves.toBeUndefined();

      expect(maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledTimes(2);
    });

    it('should do nothing when no enabled schedules exist', async () => {
      jest.spyOn(scheduleRepository, 'find').mockResolvedValue([]);

      await service.evaluateAll();

      expect(maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
    });

    it('should use last-done maintenance endTime as baseline, not resource createdAt', async () => {
      const resourceCreatedAt = new Date('2024-01-01T00:00:00.000Z');
      // Last maintenance done 2 days ago — not yet 30 days, so should NOT trigger
      const lastDoneEndTime = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

      jest.spyOn(scheduleRepository, 'find').mockResolvedValue([
        {
          id: scheduleId,
          resourceId: 1,
          enabled: true,
          triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
          usageHoursConfig: null,
          usageCountConfig: null,
          timeIntervalConfig: { duration: 30, unit: 'DAYS' },
        } as ResourceMaintenanceSchedule,
      ]);

      const maintenanceQb = createQueryBuilderMock();
      // first call (last done query): returns the recent last-done date
      // second call (active query): no active maintenance
      maintenanceQb.getRawMany
        .mockResolvedValueOnce([
          { resourceId: 1, scheduleId, lastEndTime: lastDoneEndTime.toISOString() },
        ])
        .mockResolvedValueOnce([]);
      jest.spyOn(maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      jest.spyOn(resourceRepository, 'find').mockResolvedValue([
        { id: 1, createdAt: resourceCreatedAt } as Resource,
      ]);

      await service.evaluateAll();

      // Should NOT trigger because only 2 days elapsed since last done (< 30 day threshold)
      expect(maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
    });

    it('should not run concurrent evaluations when lock is held', async () => {
      // Use a pending Promise so the first call holds the lock across microtask boundaries,
      // ensuring the second call observes the lock before the first finishes.
      let resolveFind!: (val: ResourceMaintenanceSchedule[]) => void;
      const pendingFind = new Promise<ResourceMaintenanceSchedule[]>((res) => { resolveFind = res; });
      jest.spyOn(scheduleRepository, 'find').mockReturnValue(pendingFind);

      const firstCall = service.evaluateAll();
      // Second call fires while firstCall is still awaiting scheduleRepository.find
      const secondCall = service.evaluateAll();

      resolveFind([]);
      await Promise.all([firstCall, secondCall]);

      // find called once: second call skipped due to lock held by first
      expect(scheduleRepository.find).toHaveBeenCalledTimes(1);
    });
  });

  describe('onResourceUsage', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should not call evaluateResource when usage has no resource or resource id', async () => {
      const evalSpy = jest.spyOn(service, 'evaluateResource').mockResolvedValue();

      service.onResourceUsage(usageEndedEvent({ id: 1, resource: null }));
      jest.runAllTimers();
      expect(evalSpy).not.toHaveBeenCalled();

      service.onResourceUsage(usageEndedEvent({ id: 1, resource: {} }));
      jest.runAllTimers();
      expect(evalSpy).not.toHaveBeenCalled();
    });

    it('should not call evaluateResource when session not ended (endTime null)', async () => {
      const evalSpy = jest.spyOn(service, 'evaluateResource').mockResolvedValue();
      const event = usageEndedEvent({
        id: 1,
        endTime: null,
        resource: { id: resourceId },
      });

      service.onResourceUsage(event);
      jest.runAllTimers();

      expect(evalSpy).not.toHaveBeenCalled();
    });

    it('should call evaluateResource after debounce when session ended', async () => {
      const evalSpy = jest.spyOn(service, 'evaluateResource').mockResolvedValue();
      const event = usageEndedEvent({
        id: 1,
        endTime: new Date(),
        resource: { id: resourceId },
      });

      service.onResourceUsage(event);

      // Not called yet (debounce pending)
      expect(evalSpy).not.toHaveBeenCalled();

      jest.runAllTimers();

      expect(evalSpy).toHaveBeenCalledWith(resourceId);
    });

    it('should debounce: only call evaluateResource once for rapid successive events', async () => {
      const evalSpy = jest.spyOn(service, 'evaluateResource').mockResolvedValue();
      const event = usageEndedEvent({
        id: 1,
        endTime: new Date(),
        resource: { id: resourceId },
      });

      service.onResourceUsage(event);
      service.onResourceUsage(event);
      service.onResourceUsage(event);

      jest.runAllTimers();

      expect(evalSpy).toHaveBeenCalledTimes(1);
    });

    it('should evaluate different resources independently (no cross-resource debounce)', async () => {
      const evalSpy = jest.spyOn(service, 'evaluateResource').mockResolvedValue();

      service.onResourceUsage(usageEndedEvent({ id: 1, endTime: new Date(), resource: { id: 1 } }));
      service.onResourceUsage(usageEndedEvent({ id: 2, endTime: new Date(), resource: { id: 2 } }));

      jest.runAllTimers();

      expect(evalSpy).toHaveBeenCalledWith(1);
      expect(evalSpy).toHaveBeenCalledWith(2);
      expect(evalSpy).toHaveBeenCalledTimes(2);
    });

    it('should fire after maxWait even when events keep arriving (prevents starvation)', async () => {
      const evalSpy = jest.spyOn(service, 'evaluateResource').mockResolvedValue();
      const event = usageEndedEvent({
        id: 1,
        endTime: new Date(),
        resource: { id: resourceId },
      });

      // Keep sending events every 4s (within the 5s debounce window)
      service.onResourceUsage(event);
      jest.advanceTimersByTime(4_000); // t=4s — debounce resets, still pending
      service.onResourceUsage(event);
      jest.advanceTimersByTime(4_000); // t=8s — debounce resets, still pending
      service.onResourceUsage(event);
      jest.advanceTimersByTime(4_000); // t=12s — debounce resets, still pending
      service.onResourceUsage(event);
      jest.advanceTimersByTime(4_000); // t=16s — debounce resets, still pending
      service.onResourceUsage(event);
      jest.advanceTimersByTime(4_000); // t=20s — debounce resets, still pending
      service.onResourceUsage(event);
      jest.advanceTimersByTime(4_000); // t=24s — debounce resets, still pending
      service.onResourceUsage(event);

      // Not yet called — maxWait (30s) not reached and no event gap ≥ 5s
      expect(evalSpy).not.toHaveBeenCalled();

      // Advance to t=30s — maxWait deadline reached, next timer fires immediately
      jest.advanceTimersByTime(6_000);

      expect(evalSpy).toHaveBeenCalledTimes(1);
      expect(evalSpy).toHaveBeenCalledWith(resourceId);
    });
  });

  describe('onMaintenanceChanged', () => {
    it('should call evaluateResource when maintenance changed (e.g. marked done)', async () => {
      const evalSpy = jest.spyOn(service, 'evaluateResource').mockResolvedValue();
      const event = new ResourceMaintenanceChangedEvent(resourceId, 99);

      service.onMaintenanceChanged(event);
      await new Promise((resolve) => setImmediate(resolve));

      expect(evalSpy).toHaveBeenCalledWith(resourceId);
    });

    it('should not call evaluateResource when resourceId is null', async () => {
      const evalSpy = jest.spyOn(service, 'evaluateResource').mockResolvedValue();
      const event = new ResourceMaintenanceChangedEvent(null as never, 99);

      service.onMaintenanceChanged(event);
      await new Promise((resolve) => setImmediate(resolve));

      expect(evalSpy).not.toHaveBeenCalled();
    });
  });
});
