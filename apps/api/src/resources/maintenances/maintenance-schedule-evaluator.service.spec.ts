import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaintenanceScheduleEvaluatorService } from './maintenance-schedule-evaluator.service';
import { ResourceMaintenanceService } from './maintenance.service';
import {
  ResourceMaintenanceSchedule,
  ResourceMaintenance,
  Resource,
  ResourceUsage,
  ResourceMaintenanceScheduleTriggerType,
} from '@attraccess/database-entities';

const createQueryBuilderMock = () => ({
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  getOne: jest.fn(),
  getRawOne: jest.fn(),
  getCount: jest.fn(),
});

describe('MaintenanceScheduleEvaluatorService', () => {
  let service: MaintenanceScheduleEvaluatorService;
  let maintenanceService: ResourceMaintenanceService;
  let scheduleRepository: Repository<ResourceMaintenanceSchedule>;
  let maintenanceRepository: Repository<ResourceMaintenance>;
  let usageRepository: Repository<ResourceUsage>;

  const resourceId = 1;
  const scheduleId = 10;
  const baselineDate = new Date('2025-01-01T00:00:00.000Z');

  beforeEach(async () => {
    const qb = createQueryBuilderMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceScheduleEvaluatorService,
        {
          provide: getRepositoryToken(ResourceMaintenanceSchedule),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
          },
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
          },
        },
        {
          provide: getRepositoryToken(ResourceUsage),
          useValue: {
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
      ],
    }).compile();

    service = module.get<MaintenanceScheduleEvaluatorService>(MaintenanceScheduleEvaluatorService);
    maintenanceService = module.get<ResourceMaintenanceService>(ResourceMaintenanceService);
    scheduleRepository = module.get(getRepositoryToken(ResourceMaintenanceSchedule));
    maintenanceRepository = module.get(getRepositoryToken(ResourceMaintenance));
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
          usageHoursConfig: { thresholdMinutes: 60 },
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
          usageHoursConfig: { thresholdMinutes: 60 },
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
      );
      const reason = (maintenanceService.createMaintenanceFromSchedule as jest.Mock).mock.calls[0][2];
      const parsed = JSON.parse(reason);
      expect(parsed.i18nKey).toBe('reason.auto.usageHours');
      expect(parsed.details.hours).toBe(1); // thresholdMinutes 60 -> 1 hour
    });

    it('should not create when USAGE_HOURS threshold not met', async () => {
      jest.spyOn(scheduleRepository, 'find').mockResolvedValue([
        {
          id: scheduleId,
          resourceId,
          enabled: true,
          triggerType: 'USAGE_HOURS',
          usageHoursConfig: { thresholdMinutes: 600 },
          usageCountConfig: null,
          timeIntervalConfig: null,
        } as ResourceMaintenanceSchedule,
      ]);

      const usageQb = createQueryBuilderMock();
      usageQb.getRawOne.mockResolvedValue({ total: '100' }); // 100 < 600
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(usageRepository, 'createQueryBuilder').mockReturnValue(usageQb as any);

      await service.evaluateResource(resourceId);

      expect(maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
    });

    it('should create when TIME_INTERVAL intervalDays due', async () => {
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
          timeIntervalConfig: { intervalDays: 30, thresholdHours: null },
        } as ResourceMaintenanceSchedule,
      ]);

      await service.evaluateResource(resourceId);

      expect(maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledWith(
        resourceId,
        scheduleId,
        expect.any(String),
      );
      const reason = (maintenanceService.createMaintenanceFromSchedule as jest.Mock).mock.calls[0][2];
      const parsed = JSON.parse(reason);
      expect(parsed.i18nKey).toBe('reason.auto.intervalDays');
      expect(parsed.details.days).toBe(30);
    });

    it('should skip disabled schedules', async () => {
      jest.spyOn(scheduleRepository, 'find').mockResolvedValue([
        {
          id: scheduleId,
          resourceId,
          enabled: false,
          triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_HOURS,
          usageHoursConfig: { thresholdMinutes: 1 },
        } as ResourceMaintenanceSchedule,
      ]);

      await service.evaluateResource(resourceId);

      expect(maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
    });
  });

  describe('evaluateAll', () => {
    it('should evaluate all resources with enabled schedules', async () => {
      jest.spyOn(scheduleRepository, 'find').mockResolvedValue([
        { id: scheduleId, resourceId: 1 } as ResourceMaintenanceSchedule,
        { id: scheduleId + 1, resourceId: 2 } as ResourceMaintenanceSchedule,
      ]);

      const evalSpy = jest.spyOn(service, 'evaluateResource').mockResolvedValue();

      await service.evaluateAll();

      expect(evalSpy).toHaveBeenCalledWith(1);
      expect(evalSpy).toHaveBeenCalledWith(2);
    });
  });
});
