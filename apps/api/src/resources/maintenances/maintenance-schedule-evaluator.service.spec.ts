import { registerMaintenanceScheduleEvaluatorServiceFixture } from './maintenance-schedule-evaluator.service.maintenance-schedule-evaluator-service.test-fixture';

import {
  Resource,
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleDurationBasis,
  ResourceMaintenanceScheduleTriggerType,
} from '@attraccess/database-entities';
import { formatDbDate } from './maintenance-schedule-evaluator.service';

describe('MaintenanceScheduleEvaluatorService', () => {
  const fixture = registerMaintenanceScheduleEvaluatorServiceFixture();

  it('should be defined', () => {
    expect(fixture.service).toBeDefined();
  });

  describe('getBaselineDate', () => {
    it('should return resource createdAt when no previous maintenance for schedule', async () => {
      const result = await fixture.service.getBaselineDate(fixture.resourceId, fixture.scheduleId);
      expect(result).toEqual(fixture.baselineDate);
    });

    it('should return last maintenance endTime when exists', async () => {
      const lastEnd = new Date('2025-02-01T12:00:00.000Z');
      const mockQb = fixture.createQueryBuilderMock();
      mockQb.getOne.mockResolvedValue({ endTime: lastEnd });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(mockQb as any);

      const result = await fixture.service.getBaselineDate(fixture.resourceId, fixture.scheduleId);
      expect(result).toEqual(lastEnd);
    });
  });

  it('selects total operating duration independently of session duration', async () => {
    fixture.operatingAttribution.getDurationsForWindows.mockResolvedValue(
      new Map([
        [`${fixture.scheduleId}:${fixture.resourceId}`, { sessionDurationMs: 0, operatingDurationMs: 60 * 60_000 }],
      ]),
    );
    const triggered = await fixture.service.shouldTrigger(
      {
        id: fixture.scheduleId,
        resourceId: fixture.resourceId,
        triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_HOURS,
        durationBasis: ResourceMaintenanceScheduleDurationBasis.ATTRIBUTABLE_OPERATING_DURATION,
        usageHoursConfig: { duration: 1, unit: 'HOURS' as const },
      } as ResourceMaintenanceSchedule,
      fixture.resourceId,
    );
    expect(triggered).toBe(true);
    expect(fixture.operatingAttribution.getDurationsForWindows).toHaveBeenCalledWith(
      [
        {
          key: `${fixture.scheduleId}:${fixture.resourceId}`,
          resourceId: fixture.resourceId,
          start: fixture.baselineDate,
        },
      ],
      expect.any(Date),
      undefined,
    );
  });

  describe('evaluateResource', () => {
    it.each([
      { kind: 'manual', activeScheduleId: null },
      { kind: 'another schedule', activeScheduleId: fixture.scheduleId + 1 },
    ])('does not create a second maintenance while $kind maintenance is active', async ({ activeScheduleId }) => {
      jest
        .spyOn(fixture.scheduleRepository, 'find')
        .mockResolvedValue([
          { id: fixture.scheduleId, resourceId: fixture.resourceId, enabled: true } as ResourceMaintenanceSchedule,
        ]);
      jest.spyOn(fixture.service, 'shouldTrigger').mockResolvedValue(true);
      // The resource has an active record, but it does not belong to the schedule being evaluated.
      jest
        .spyOn(fixture.maintenanceService, 'hasActiveMaintenance')
        .mockImplementation(async (filter) => typeof filter === 'number' || filter.scheduleId === activeScheduleId);

      await fixture.service.evaluateResource(fixture.resourceId);

      expect(fixture.maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
    });

    it('should not create maintenance when resource has active maintenance', async () => {
      jest.spyOn(fixture.maintenanceService, 'hasActiveMaintenance').mockResolvedValue(true);
      jest.spyOn(fixture.scheduleRepository, 'find').mockResolvedValue([
        {
          id: fixture.scheduleId,
          resourceId: fixture.resourceId,
          enabled: true,
          triggerType: 'USAGE_HOURS',
          usageHoursConfig: { duration: 1, unit: 'HOURS' as const },
        } as ResourceMaintenanceSchedule,
      ]);

      await fixture.service.evaluateResource(fixture.resourceId);

      expect(fixture.maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
    });

    it('should create maintenance when USAGE_HOURS threshold met and no active maintenance', async () => {
      jest.spyOn(fixture.scheduleRepository, 'find').mockResolvedValue([
        {
          id: fixture.scheduleId,
          resourceId: fixture.resourceId,
          enabled: true,
          triggerType: 'USAGE_HOURS',
          usageHoursConfig: { duration: 1, unit: 'HOURS' as const },
          usageCountConfig: null,
          timeIntervalConfig: null,
        } as ResourceMaintenanceSchedule,
      ]);

      fixture.operatingAttribution.getDurationsForWindows.mockResolvedValue(
        new Map([
          [`${fixture.scheduleId}:${fixture.resourceId}`, { sessionDurationMs: 120 * 60_000, operatingDurationMs: 0 }],
        ]),
      );

      await fixture.service.evaluateResource(fixture.resourceId);

      expect(fixture.maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledWith(
        fixture.resourceId,
        fixture.scheduleId,
        expect.any(String),
        expect.anything(),
        false,
      );
      const reason = (fixture.maintenanceService.createMaintenanceFromSchedule as jest.Mock).mock.calls[0][2];
      const parsed = JSON.parse(reason);
      expect(parsed.i18nKey).toBe('reason.auto.usageHoursHours');
      expect(parsed.details.duration).toBe(1);
    });

    it('should not create when USAGE_HOURS threshold not met', async () => {
      jest.spyOn(fixture.scheduleRepository, 'find').mockResolvedValue([
        {
          id: fixture.scheduleId,
          resourceId: fixture.resourceId,
          enabled: true,
          triggerType: 'USAGE_HOURS',
          usageHoursConfig: { duration: 10, unit: 'HOURS' as const },
          usageCountConfig: null,
          timeIntervalConfig: null,
        } as ResourceMaintenanceSchedule,
      ]);

      fixture.operatingAttribution.getDurationsForWindows.mockResolvedValue(
        new Map([
          [`${fixture.scheduleId}:${fixture.resourceId}`, { sessionDurationMs: 100 * 60_000, operatingDurationMs: 0 }],
        ]),
      );

      await fixture.service.evaluateResource(fixture.resourceId);

      expect(fixture.maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
    });

    it('should create when TIME_INTERVAL threshold due', async () => {
      const oldBaseline = new Date('2024-12-01T00:00:00.000Z');
      const mantQb = fixture.createQueryBuilderMock();
      mantQb.getOne.mockResolvedValue({ endTime: oldBaseline });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(mantQb as any);

      jest.spyOn(fixture.scheduleRepository, 'find').mockResolvedValue([
        {
          id: fixture.scheduleId,
          resourceId: fixture.resourceId,
          enabled: true,
          triggerType: 'TIME_INTERVAL',
          usageHoursConfig: null,
          usageCountConfig: null,
          timeIntervalConfig: { duration: 30, unit: 'DAYS' },
        } as ResourceMaintenanceSchedule,
      ]);

      await fixture.service.evaluateResource(fixture.resourceId);

      expect(fixture.maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledWith(
        fixture.resourceId,
        fixture.scheduleId,
        expect.any(String),
        expect.anything(),
        false,
      );
      const reason = (fixture.maintenanceService.createMaintenanceFromSchedule as jest.Mock).mock.calls[0][2];
      const parsed = JSON.parse(reason);
      expect(parsed.i18nKey).toBe('reason.auto.timeIntervalDays');
      expect(parsed.details.duration).toBe(30);
    });

    it('should skip disabled schedules', async () => {
      jest.spyOn(fixture.scheduleRepository, 'find').mockResolvedValue([
        {
          id: fixture.scheduleId,
          resourceId: fixture.resourceId,
          enabled: false,
          triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_HOURS,
          usageHoursConfig: { duration: 1, unit: 'MINUTES' as const },
        } as ResourceMaintenanceSchedule,
      ]);

      await fixture.service.evaluateResource(fixture.resourceId);

      expect(fixture.maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
    });
  });

  describe('evaluateAll', () => {
    it('should create maintenances for resources whose TIME_INTERVAL schedule is due', async () => {
      const oldCreatedAt = new Date('2024-01-01T00:00:00.000Z');

      // Two resources with TIME_INTERVAL schedules due (baseline is createdAt, > 30 days ago)
      jest.spyOn(fixture.scheduleRepository, 'find').mockResolvedValue([
        {
          id: fixture.scheduleId,
          resourceId: 1,
          enabled: true,
          triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
          usageHoursConfig: null,
          usageCountConfig: null,
          timeIntervalConfig: { duration: 30, unit: 'DAYS' },
        } as ResourceMaintenanceSchedule,
        {
          id: fixture.scheduleId + 1,
          resourceId: 2,
          enabled: true,
          triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
          usageHoursConfig: null,
          usageCountConfig: null,
          timeIntervalConfig: { duration: 30, unit: 'DAYS' },
        } as ResourceMaintenanceSchedule,
      ]);

      // No last-done maintenances, no active maintenances
      const maintenanceQb = fixture.createQueryBuilderMock();
      maintenanceQb.getRawMany.mockResolvedValue([]);
      jest.spyOn(fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      // Resources with old createdAt (> 30 days) so TIME_INTERVAL triggers
      jest
        .spyOn(fixture.resourceRepository, 'find')
        .mockResolvedValue([
          { id: 1, createdAt: oldCreatedAt } as Resource,
          { id: 2, createdAt: oldCreatedAt } as Resource,
        ]);

      await fixture.service.evaluateAll();

      expect(fixture.scheduleRepository.manager.transaction).toHaveBeenCalledTimes(1);
      expect(fixture.maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledTimes(2);
      expect(fixture.maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledWith(
        1,
        fixture.scheduleId,
        expect.any(String),
        expect.anything(),
        false,
      );
      expect(fixture.maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledWith(
        2,
        fixture.scheduleId + 1,
        expect.any(String),
        expect.anything(),
        false,
      );
      expect(fixture.maintenanceService.emitScheduledMaintenanceCreated).toHaveBeenCalledWith(1, 1);
      expect(fixture.maintenanceService.emitScheduledMaintenanceCreated).toHaveBeenCalledWith(2, 1);
      expect(fixture.maintenanceService.hasActiveMaintenance).toHaveBeenCalledWith(1, expect.anything());
      expect(fixture.maintenanceService.hasActiveMaintenance).toHaveBeenCalledWith(2, expect.anything());
    });

    it('should write due schedules in bounded transactions', async () => {
      const oldCreatedAt = new Date('2024-01-01T00:00:00.000Z');
      const dueSchedules = Array.from(
        { length: 101 },
        (_, index) =>
          ({
            id: fixture.scheduleId + index,
            resourceId: index + 1,
            enabled: true,
            triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
            timeIntervalConfig: { duration: 30, unit: 'DAYS' },
          }) as ResourceMaintenanceSchedule,
      );

      jest.spyOn(fixture.scheduleRepository, 'find').mockResolvedValue(dueSchedules);
      const maintenanceQb = fixture.createQueryBuilderMock();
      maintenanceQb.getRawMany.mockResolvedValue([]);
      jest.spyOn(fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any
      jest
        .spyOn(fixture.resourceRepository, 'find')
        .mockResolvedValue(dueSchedules.map(({ resourceId: id }) => ({ id, createdAt: oldCreatedAt }) as Resource));
      (fixture.maintenanceService.hasActiveMaintenance as jest.Mock).mockImplementation((id: number) =>
        Promise.resolve(id === 101),
      );

      await fixture.service.evaluateAll();

      expect(fixture.scheduleRepository.manager.transaction).toHaveBeenCalledTimes(2);
      expect(fixture.maintenanceService.hasActiveMaintenance).toHaveBeenCalledWith(101, expect.anything());
      expect(fixture.maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledTimes(100);
      expect(fixture.maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalledWith(
        101,
        expect.anything(),
        expect.anything(),
        expect.anything(),
        false,
      );
    });

    it('should continue creating other due maintenances when a stale active check succeeds', async () => {
      const oldCreatedAt = new Date('2024-01-01T00:00:00.000Z');
      jest.spyOn(fixture.scheduleRepository, 'find').mockResolvedValue([
        {
          id: fixture.scheduleId,
          resourceId: 1,
          enabled: true,
          triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
          timeIntervalConfig: { duration: 30, unit: 'DAYS' },
        } as ResourceMaintenanceSchedule,
        {
          id: fixture.scheduleId + 1,
          resourceId: 2,
          enabled: true,
          triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
          timeIntervalConfig: { duration: 30, unit: 'DAYS' },
        } as ResourceMaintenanceSchedule,
      ]);
      const maintenanceQb = fixture.createQueryBuilderMock();
      maintenanceQb.getRawMany.mockResolvedValue([]);
      jest.spyOn(fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any
      jest
        .spyOn(fixture.resourceRepository, 'find')
        .mockResolvedValue([
          { id: 1, createdAt: oldCreatedAt } as Resource,
          { id: 2, createdAt: oldCreatedAt } as Resource,
        ]);
      jest
        .spyOn(fixture.maintenanceService, 'hasActiveMaintenance')
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      await fixture.service.evaluateAll();

      expect(fixture.scheduleRepository.manager.transaction).toHaveBeenCalledTimes(1);
      expect(fixture.maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledTimes(1);
      expect(fixture.maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledWith(
        2,
        fixture.scheduleId + 1,
        expect.any(String),
        expect.anything(),
        false,
      );
    });

    it('should not create maintenance when TIME_INTERVAL not yet due', async () => {
      // Schedule due in 30 days, resource created 1 day ago
      const recentCreatedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);

      jest.spyOn(fixture.scheduleRepository, 'find').mockResolvedValue([
        {
          id: fixture.scheduleId,
          resourceId: 1,
          enabled: true,
          triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
          usageHoursConfig: null,
          usageCountConfig: null,
          timeIntervalConfig: { duration: 30, unit: 'DAYS' },
        } as ResourceMaintenanceSchedule,
      ]);

      const maintenanceQb = fixture.createQueryBuilderMock();
      maintenanceQb.getRawMany.mockResolvedValue([]);
      jest.spyOn(fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      jest
        .spyOn(fixture.resourceRepository, 'find')
        .mockResolvedValue([{ id: 1, createdAt: recentCreatedAt } as Resource]);

      const querySpy = jest.spyOn(fixture.usageRepository, 'query');

      await fixture.service.evaluateAll();

      expect(fixture.maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
      expect(querySpy).toHaveBeenCalledTimes(1);
      expect(querySpy.mock.calls[0][0]).not.toContain('resource_usage');
    });

    it('should skip orphaned schedules without issuing an invalid empty-pairs query', async () => {
      jest.spyOn(fixture.scheduleRepository, 'find').mockResolvedValue([
        {
          id: fixture.scheduleId,
          resourceId: 1,
          enabled: true,
          triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
          timeIntervalConfig: { duration: 1, unit: 'DAYS' },
        } as ResourceMaintenanceSchedule,
      ]);
      jest.spyOn(fixture.resourceRepository, 'find').mockResolvedValue([]);
      const querySpy = jest.spyOn(fixture.usageRepository, 'query');

      await fixture.service.evaluateAll();

      expect(querySpy).not.toHaveBeenCalled();
      expect(fixture.maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
    });

    it('should chunk usage evaluation queries below SQLite bind limits', async () => {
      const count = 10_922;
      const oldCreatedAt = new Date('2024-01-01T00:00:00.000Z');
      const schedules = Array.from(
        { length: count },
        (_, index) =>
          ({
            id: index + 1,
            resourceId: index + 1,
            enabled: true,
            triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_COUNT,
            usageCountConfig: { thresholdSessions: 1 },
          }) as ResourceMaintenanceSchedule,
      );
      jest.spyOn(fixture.scheduleRepository, 'find').mockResolvedValue(schedules);
      jest
        .spyOn(fixture.resourceRepository, 'find')
        .mockResolvedValue(schedules.map(({ resourceId: id }) => ({ id, createdAt: oldCreatedAt }) as Resource));
      const querySpy = jest.spyOn(fixture.usageRepository, 'query').mockResolvedValue([]);

      await fixture.service.evaluateAll();

      expect(querySpy).toHaveBeenCalledTimes(2);
      expect(querySpy.mock.calls.map(([, params]) => (params as unknown[]).length)).toEqual([32_764, 4]);
    });

    it('should skip resources that already have active maintenance', async () => {
      const oldCreatedAt = new Date('2024-01-01T00:00:00.000Z');

      jest.spyOn(fixture.scheduleRepository, 'find').mockResolvedValue([
        {
          id: fixture.scheduleId,
          resourceId: 1,
          enabled: true,
          triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
          usageHoursConfig: null,
          usageCountConfig: null,
          timeIntervalConfig: { duration: 30, unit: 'DAYS' },
        } as ResourceMaintenanceSchedule,
      ]);

      // The combined evaluation query reports this resource as active.
      const maintenanceQb = fixture.createQueryBuilderMock();
      maintenanceQb.getRawMany
        .mockResolvedValueOnce([]) // first call: last done query
        .mockResolvedValueOnce([{ resourceId: 1, scheduleId: fixture.scheduleId }]); // second call: active query
      jest.spyOn(fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      jest
        .spyOn(fixture.resourceRepository, 'find')
        .mockResolvedValue([{ id: 1, createdAt: oldCreatedAt } as Resource]);
      jest.spyOn(fixture.usageRepository, 'query').mockResolvedValue([
        {
          resourceId: 1,
          scheduleId: fixture.scheduleId,
          hasActiveMaintenance: 1,
          totalMinutes: 0,
          totalCount: 0,
        },
      ]);

      await fixture.service.evaluateAll();

      expect(fixture.maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
    });

    it('should evaluate USAGE_HOURS using bulk-fetched usage data', async () => {
      const oldCreatedAt = new Date('2024-01-01T00:00:00.000Z');

      jest.spyOn(fixture.scheduleRepository, 'find').mockResolvedValue([
        {
          id: fixture.scheduleId,
          resourceId: 1,
          enabled: true,
          triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_HOURS,
          usageHoursConfig: { duration: 1, unit: 'HOURS' as const },
          usageCountConfig: null,
          timeIntervalConfig: null,
        } as ResourceMaintenanceSchedule,
      ]);

      // No last-done maintenances, no active maintenances — maintenance qb
      const maintenanceQb = fixture.createQueryBuilderMock();
      maintenanceQb.getRawMany.mockResolvedValue([]);
      jest.spyOn(fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      jest
        .spyOn(fixture.resourceRepository, 'find')
        .mockResolvedValue([{ id: 1, createdAt: oldCreatedAt } as Resource]);

      fixture.operatingAttribution.getDurationsForWindows.mockResolvedValue(
        new Map([[`${fixture.scheduleId}:1`, { sessionDurationMs: 120 * 60_000, operatingDurationMs: 0 }]]),
      );
      // The state query supplies each service-cycle baseline.
      jest
        .spyOn(fixture.usageRepository, 'query')
        .mockResolvedValue([{ resourceId: 1, scheduleId: fixture.scheduleId, totalMinutes: '120', totalCount: '3' }]);

      await fixture.service.evaluateAll();

      expect(fixture.maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledWith(
        1,
        fixture.scheduleId,
        expect.any(String),
        expect.anything(),
        false,
      );
    });

    it('rechecks a duration cycle completed between the bulk read and maintenance creation', async () => {
      jest.spyOn(fixture.scheduleRepository, 'find').mockResolvedValue([
        {
          id: fixture.scheduleId,
          resourceId: 1,
          enabled: true,
          triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_HOURS,
          usageHoursConfig: { duration: 1, unit: 'HOURS' },
        } as ResourceMaintenanceSchedule,
      ]);
      fixture.operatingAttribution.getDurationsForWindows
        .mockResolvedValueOnce(
          new Map([[`${fixture.scheduleId}:1`, { sessionDurationMs: 120 * 60_000, operatingDurationMs: 0 }]]),
        )
        .mockResolvedValueOnce(
          new Map([[`${fixture.scheduleId}:1`, { sessionDurationMs: 0, operatingDurationMs: 0 }]]),
        );
      const completedAt = new Date();
      jest.spyOn(fixture.service, 'getBaselineDate').mockResolvedValue(completedAt);

      await fixture.service.evaluateAll();

      expect(fixture.operatingAttribution.getDurationsForWindows).toHaveBeenNthCalledWith(
        2,
        [{ key: `${fixture.scheduleId}:1`, resourceId: 1, start: completedAt }],
        expect.any(Date),
        expect.anything(),
      );
      expect(fixture.maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
    });

    it('should not create maintenance when USAGE_HOURS threshold not met in bulk data', async () => {
      const oldCreatedAt = new Date('2024-01-01T00:00:00.000Z');

      jest.spyOn(fixture.scheduleRepository, 'find').mockResolvedValue([
        {
          id: fixture.scheduleId,
          resourceId: 1,
          enabled: true,
          triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_HOURS,
          usageHoursConfig: { duration: 10, unit: 'HOURS' as const }, // 600 minutes threshold
          usageCountConfig: null,
          timeIntervalConfig: null,
        } as ResourceMaintenanceSchedule,
      ]);

      const maintenanceQb = fixture.createQueryBuilderMock();
      maintenanceQb.getRawMany.mockResolvedValue([]);
      jest.spyOn(fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      jest
        .spyOn(fixture.resourceRepository, 'find')
        .mockResolvedValue([{ id: 1, createdAt: oldCreatedAt } as Resource]);

      fixture.operatingAttribution.getDurationsForWindows.mockResolvedValue(
        new Map([[`${fixture.scheduleId}:1`, { sessionDurationMs: 100 * 60_000, operatingDurationMs: 0 }]]),
      );
      // 100 minutes < 600 minutes threshold
      jest
        .spyOn(fixture.usageRepository, 'query')
        .mockResolvedValue([{ resourceId: 1, scheduleId: fixture.scheduleId, totalMinutes: '100', totalCount: '2' }]);

      await fixture.service.evaluateAll();

      expect(fixture.maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
    });

    it('should evaluate USAGE_COUNT using bulk-fetched usage data', async () => {
      const oldCreatedAt = new Date('2024-01-01T00:00:00.000Z');

      jest.spyOn(fixture.scheduleRepository, 'find').mockResolvedValue([
        {
          id: fixture.scheduleId,
          resourceId: 1,
          enabled: true,
          triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_COUNT,
          usageHoursConfig: null,
          usageCountConfig: { thresholdSessions: 5 },
          timeIntervalConfig: null,
        } as ResourceMaintenanceSchedule,
      ]);

      const maintenanceQb = fixture.createQueryBuilderMock();
      maintenanceQb.getRawMany.mockResolvedValue([]);
      jest.spyOn(fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      jest
        .spyOn(fixture.resourceRepository, 'find')
        .mockResolvedValue([{ id: 1, createdAt: oldCreatedAt } as Resource]);

      // SQL aggregation returns totalCount=7 (>= 5 threshold)
      jest
        .spyOn(fixture.usageRepository, 'query')
        .mockResolvedValue([{ resourceId: 1, scheduleId: fixture.scheduleId, totalMinutes: '0', totalCount: '7' }]);

      await fixture.service.evaluateAll();

      expect(fixture.maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledWith(
        1,
        fixture.scheduleId,
        expect.any(String),
        expect.anything(),
        false,
      );
      const reason = (fixture.maintenanceService.createMaintenanceFromSchedule as jest.Mock).mock.calls[0][2];
      expect(JSON.parse(reason).i18nKey).toBe('reason.auto.usageCount');
    });

    it('should not create maintenance when USAGE_COUNT threshold not met in bulk data', async () => {
      const oldCreatedAt = new Date('2024-01-01T00:00:00.000Z');

      jest.spyOn(fixture.scheduleRepository, 'find').mockResolvedValue([
        {
          id: fixture.scheduleId,
          resourceId: 1,
          enabled: true,
          triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_COUNT,
          usageHoursConfig: null,
          usageCountConfig: { thresholdSessions: 10 },
          timeIntervalConfig: null,
        } as ResourceMaintenanceSchedule,
      ]);

      const maintenanceQb = fixture.createQueryBuilderMock();
      maintenanceQb.getRawMany.mockResolvedValue([]);
      jest.spyOn(fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      jest
        .spyOn(fixture.resourceRepository, 'find')
        .mockResolvedValue([{ id: 1, createdAt: oldCreatedAt } as Resource]);

      // 3 sessions < 10 threshold
      jest
        .spyOn(fixture.usageRepository, 'query')
        .mockResolvedValue([{ resourceId: 1, scheduleId: fixture.scheduleId, totalMinutes: '0', totalCount: '3' }]);

      await fixture.service.evaluateAll();

      expect(fixture.maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
    });

    it('should evaluate each usage-based schedule against its own baseline, not a shared one', async () => {
      const otherScheduleId = fixture.scheduleId + 1;
      const resourceCreatedAt = new Date('2024-01-01T00:00:00.000Z');
      const recentlyServiced = new Date('2026-06-01T00:00:00.000Z');

      jest.spyOn(fixture.scheduleRepository, 'find').mockResolvedValue([
        // Never serviced -> baseline is resource createdAt, plenty of usage accumulated
        {
          id: fixture.scheduleId,
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

      const maintenanceQb = fixture.createQueryBuilderMock();
      maintenanceQb.getRawMany
        .mockResolvedValueOnce([
          { resourceId: 1, scheduleId: otherScheduleId, lastEndTime: recentlyServiced.toISOString() },
        ])
        .mockResolvedValueOnce([]);
      jest.spyOn(fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      jest
        .spyOn(fixture.resourceRepository, 'find')
        .mockResolvedValue([{ id: 1, createdAt: resourceCreatedAt } as Resource]);

      fixture.operatingAttribution.getDurationsForWindows.mockResolvedValue(
        new Map([
          [`${fixture.scheduleId}:1`, { sessionDurationMs: 900 * 60_000, operatingDurationMs: 0 }],
          [`${otherScheduleId}:1`, { sessionDurationMs: 30 * 60_000, operatingDurationMs: 0 }],
        ]),
      );
      // Same resource, different service-cycle baselines.
      const querySpy = jest.spyOn(fixture.usageRepository, 'query').mockResolvedValue([
        {
          resourceId: 1,
          scheduleId: fixture.scheduleId,
          baseline: resourceCreatedAt.toISOString(),
          totalMinutes: '900',
          totalCount: '9',
        },
        {
          resourceId: 1,
          scheduleId: otherScheduleId,
          baseline: recentlyServiced.toISOString(),
          totalMinutes: '30',
          totalCount: '1',
        },
      ]);

      await fixture.service.evaluateAll();

      // Resolve all service-cycle baselines together, then derive exact durations per window.
      expect(querySpy).toHaveBeenCalledTimes(1);
      expect(querySpy.mock.calls[0][0]).toContain('resource_maintenance');
      expect(querySpy.mock.calls[0][0]).not.toContain('resource_usage');
      expect(fixture.operatingAttribution.getDurationsForWindows).toHaveBeenNthCalledWith(
        1,
        [
          { key: `${fixture.scheduleId}:1`, resourceId: 1, start: resourceCreatedAt },
          { key: `${otherScheduleId}:1`, resourceId: 1, start: recentlyServiced },
        ],
        expect.any(Date),
      );

      // Both schedules must be sent to SQL with their resource-created fallback baseline.
      const params = querySpy.mock.calls[0][1] as unknown[];
      expect(params).toEqual([
        1,
        fixture.scheduleId,
        formatDbDate(resourceCreatedAt),
        1,
        otherScheduleId,
        formatDbDate(resourceCreatedAt),
        expect.any(String),
      ]);

      // Only the never-serviced schedule crossed its threshold
      expect(fixture.maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledTimes(1);
      expect(fixture.maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledWith(
        1,
        fixture.scheduleId,
        expect.any(String),
        expect.anything(),
        false,
      );
    });

    it('should continue creating scheduled maintenances when one creation fails', async () => {
      jest.spyOn(fixture.scheduleRepository, 'find').mockResolvedValue([
        {
          id: fixture.scheduleId,
          resourceId: 1,
          enabled: true,
          triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
          usageHoursConfig: null,
          usageCountConfig: null,
          timeIntervalConfig: { duration: 1, unit: 'DAYS' },
        } as ResourceMaintenanceSchedule,
        {
          id: fixture.scheduleId + 1,
          resourceId: 2,
          enabled: true,
          triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
          usageHoursConfig: null,
          usageCountConfig: null,
          timeIntervalConfig: { duration: 1, unit: 'DAYS' },
        } as ResourceMaintenanceSchedule,
      ]);

      const maintenanceQb = fixture.createQueryBuilderMock();
      maintenanceQb.getRawMany.mockResolvedValue([]);
      jest.spyOn(fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      jest
        .spyOn(fixture.resourceRepository, 'find')
        .mockResolvedValue([
          { id: 1, createdAt: new Date('2024-01-01T00:00:00.000Z') } as Resource,
          { id: 2, createdAt: new Date('2024-01-01T00:00:00.000Z') } as Resource,
        ]);

      jest
        .spyOn(fixture.maintenanceService, 'createMaintenanceFromSchedule')
        .mockRejectedValueOnce(new Error('resource vanished mid-run'));

      await expect(fixture.service.evaluateAll()).resolves.toBeUndefined();

      expect(fixture.scheduleRepository.manager.transaction).toHaveBeenCalledTimes(1);
      expect(fixture.maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledTimes(2);
      expect(fixture.maintenanceService.emitScheduledMaintenanceCreated).toHaveBeenCalledWith(2, 1);
    });

    it('should not emit side effects when the write transaction fails to commit', async () => {
      jest.spyOn(fixture.scheduleRepository, 'find').mockResolvedValue([
        {
          id: fixture.scheduleId,
          resourceId: 1,
          enabled: true,
          triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
          usageHoursConfig: null,
          usageCountConfig: null,
          timeIntervalConfig: { duration: 1, unit: 'DAYS' },
        } as ResourceMaintenanceSchedule,
      ]);

      const maintenanceQb = fixture.createQueryBuilderMock();
      maintenanceQb.getRawMany.mockResolvedValue([]);
      jest.spyOn(fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      jest
        .spyOn(fixture.resourceRepository, 'find')
        .mockResolvedValue([{ id: 1, createdAt: new Date('2024-01-01T00:00:00.000Z') } as Resource]);

      jest.spyOn(fixture.scheduleRepository.manager, 'transaction').mockImplementation(async (callback) => {
        await callback({ query: jest.fn().mockResolvedValue([]) } as never);
        throw new Error('transaction commit failed');
      });

      await expect(fixture.service.evaluateAll()).resolves.toBeUndefined();

      expect(fixture.maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledTimes(1);
      expect(fixture.maintenanceService.emitScheduledMaintenanceCreated).not.toHaveBeenCalled();
    });

    it('should do nothing when no enabled schedules exist', async () => {
      jest.spyOn(fixture.scheduleRepository, 'find').mockResolvedValue([]);

      await fixture.service.evaluateAll();

      expect(fixture.maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
    });

    it('should use last-done maintenance endTime as baseline, not resource createdAt', async () => {
      const resourceCreatedAt = new Date('2024-01-01T00:00:00.000Z');
      // Last maintenance done 2 days ago — not yet 30 days, so should NOT trigger
      const lastDoneEndTime = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

      jest.spyOn(fixture.scheduleRepository, 'find').mockResolvedValue([
        {
          id: fixture.scheduleId,
          resourceId: 1,
          enabled: true,
          triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
          usageHoursConfig: null,
          usageCountConfig: null,
          timeIntervalConfig: { duration: 30, unit: 'DAYS' },
        } as ResourceMaintenanceSchedule,
      ]);

      const maintenanceQb = fixture.createQueryBuilderMock();
      jest.spyOn(fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      jest
        .spyOn(fixture.resourceRepository, 'find')
        .mockResolvedValue([{ id: 1, createdAt: resourceCreatedAt } as Resource]);
      jest.spyOn(fixture.usageRepository, 'query').mockResolvedValue([
        {
          resourceId: 1,
          scheduleId: fixture.scheduleId,
          baseline: lastDoneEndTime.toISOString(),
          totalMinutes: 0,
          totalCount: 0,
        },
      ]);

      await fixture.service.evaluateAll();

      // Should NOT trigger because only 2 days elapsed since last done (< 30 day threshold)
      expect(fixture.maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
    });

    it('should not run concurrent evaluations when lock is held', async () => {
      // Use a pending Promise so the first call holds the lock across microtask boundaries,
      // ensuring the second call observes the lock before the first finishes.
      let resolveFind!: (val: ResourceMaintenanceSchedule[]) => void;
      const pendingFind = new Promise<ResourceMaintenanceSchedule[]>((res) => {
        resolveFind = res;
      });
      jest.spyOn(fixture.scheduleRepository, 'find').mockReturnValue(pendingFind);

      const firstCall = fixture.service.evaluateAll();
      // Second call fires while firstCall is still awaiting scheduleRepository.find
      const secondCall = fixture.service.evaluateAll();

      resolveFind([]);
      await Promise.all([firstCall, secondCall]);

      // find called once: second call skipped due to lock held by first
      expect(fixture.scheduleRepository.find).toHaveBeenCalledTimes(1);
    });
  });
});
