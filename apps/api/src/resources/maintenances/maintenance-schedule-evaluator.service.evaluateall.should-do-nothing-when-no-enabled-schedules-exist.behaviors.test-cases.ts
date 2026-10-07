import { registerEvaluateallScopeFixture } from './maintenance-schedule-evaluator.service.evaluateall-a68b2d.test-fixture';
import {
  Resource,
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleTriggerType,
} from '@attraccess/database-entities';

export function registerShouldDoNothingWhenNoEnabledSchedulesExistPart15Cases(
  fixture: ReturnType<typeof registerEvaluateallScopeFixture>,
) {
  it('should do nothing when no enabled schedules exist', async () => {
    jest.spyOn(fixture.fixture.scheduleRepository, 'find').mockResolvedValue([]);

    await fixture.fixture.service.evaluateAll();

    expect(fixture.fixture.maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
  });
}

export function registerShouldEvaluateUsageCountUsingBulkFetchedUsageDataPart10Cases(
  fixture: ReturnType<typeof registerEvaluateallScopeFixture>,
) {
  it('should evaluate USAGE_COUNT using bulk-fetched usage data', async () => {
    const oldCreatedAt = new Date('2024-01-01T00:00:00.000Z');

    jest.spyOn(fixture.fixture.scheduleRepository, 'find').mockResolvedValue([
      {
        id: fixture.fixture.scheduleId,
        resourceId: 1,
        enabled: true,
        triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_COUNT,
        usageHoursConfig: null,
        usageCountConfig: { thresholdSessions: 5 },
        timeIntervalConfig: null,
      } as ResourceMaintenanceSchedule,
    ]);

    const maintenanceQb = fixture.fixture.createQueryBuilderMock();
    maintenanceQb.getRawMany.mockResolvedValue([]);
    jest.spyOn(fixture.fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    jest
      .spyOn(fixture.fixture.resourceRepository, 'find')
      .mockResolvedValue([{ id: 1, createdAt: oldCreatedAt } as Resource]);

    // SQL aggregation returns totalCount=7 (>= 5 threshold)
    jest
      .spyOn(fixture.fixture.usageRepository, 'query')
      .mockResolvedValue([
        { resourceId: 1, scheduleId: fixture.fixture.scheduleId, totalMinutes: '0', totalCount: '7' },
      ]);

    await fixture.fixture.service.evaluateAll();

    expect(fixture.fixture.maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledWith(
      1,
      fixture.fixture.scheduleId,
      expect.any(String),
      expect.anything(),
      false,
    );
    const reason = (fixture.fixture.maintenanceService.createMaintenanceFromSchedule as jest.Mock).mock.calls[0][2];
    expect(JSON.parse(reason).i18nKey).toBe('reason.auto.usageCount');
  });
}

export function registerShouldEvaluateUsageHoursUsingBulkFetchedUsageDataPart7Cases(
  fixture: ReturnType<typeof registerEvaluateallScopeFixture>,
) {
  it('should evaluate USAGE_HOURS using bulk-fetched usage data', async () => {
    const oldCreatedAt = new Date('2024-01-01T00:00:00.000Z');

    jest.spyOn(fixture.fixture.scheduleRepository, 'find').mockResolvedValue([
      {
        id: fixture.fixture.scheduleId,
        resourceId: 1,
        enabled: true,
        triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_HOURS,
        usageHoursConfig: { duration: 1, unit: 'HOURS' as const },
        usageCountConfig: null,
        timeIntervalConfig: null,
      } as ResourceMaintenanceSchedule,
    ]);

    // No last-done maintenances, no active maintenances — maintenance qb
    const maintenanceQb = fixture.fixture.createQueryBuilderMock();
    maintenanceQb.getRawMany.mockResolvedValue([]);
    jest.spyOn(fixture.fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    jest
      .spyOn(fixture.fixture.resourceRepository, 'find')
      .mockResolvedValue([{ id: 1, createdAt: oldCreatedAt } as Resource]);

    fixture.fixture.operatingAttribution.getDurationsForWindows.mockResolvedValue(
      new Map([[`${fixture.fixture.scheduleId}:1`, { sessionDurationMs: 120 * 60_000, operatingDurationMs: 0 }]]),
    );
    // The state query supplies each service-cycle baseline.
    jest
      .spyOn(fixture.fixture.usageRepository, 'query')
      .mockResolvedValue([
        { resourceId: 1, scheduleId: fixture.fixture.scheduleId, totalMinutes: '120', totalCount: '3' },
      ]);

    await fixture.fixture.service.evaluateAll();

    expect(fixture.fixture.maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledWith(
      1,
      fixture.fixture.scheduleId,
      expect.any(String),
      expect.anything(),
      false,
    );
  });
}

export function registerShouldNotCreateMaintenanceWhenTimeIntervalNotYetDuePart3Cases(
  fixture: ReturnType<typeof registerEvaluateallScopeFixture>,
) {
  it('should not create maintenance when TIME_INTERVAL not yet due', async () => {
    // Schedule due in 30 days, resource created 1 day ago
    const recentCreatedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);

    jest.spyOn(fixture.fixture.scheduleRepository, 'find').mockResolvedValue([
      {
        id: fixture.fixture.scheduleId,
        resourceId: 1,
        enabled: true,
        triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
        usageHoursConfig: null,
        usageCountConfig: null,
        timeIntervalConfig: { duration: 30, unit: 'DAYS' },
      } as ResourceMaintenanceSchedule,
    ]);

    const maintenanceQb = fixture.fixture.createQueryBuilderMock();
    maintenanceQb.getRawMany.mockResolvedValue([]);
    jest.spyOn(fixture.fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    jest
      .spyOn(fixture.fixture.resourceRepository, 'find')
      .mockResolvedValue([{ id: 1, createdAt: recentCreatedAt } as Resource]);

    const querySpy = jest.spyOn(fixture.fixture.usageRepository, 'query');

    await fixture.fixture.service.evaluateAll();

    expect(fixture.fixture.maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
    expect(querySpy).toHaveBeenCalledTimes(1);
    expect(querySpy.mock.calls[0][0]).not.toContain('resource_usage');
  });
}

export function registerShouldNotCreateMaintenanceWhenUsageCountThresholdNotMetPart11Cases(
  fixture: ReturnType<typeof registerEvaluateallScopeFixture>,
) {
  it('should not create maintenance when USAGE_COUNT threshold not met in bulk data', async () => {
    const oldCreatedAt = new Date('2024-01-01T00:00:00.000Z');

    jest.spyOn(fixture.fixture.scheduleRepository, 'find').mockResolvedValue([
      {
        id: fixture.fixture.scheduleId,
        resourceId: 1,
        enabled: true,
        triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_COUNT,
        usageHoursConfig: null,
        usageCountConfig: { thresholdSessions: 10 },
        timeIntervalConfig: null,
      } as ResourceMaintenanceSchedule,
    ]);

    const maintenanceQb = fixture.fixture.createQueryBuilderMock();
    maintenanceQb.getRawMany.mockResolvedValue([]);
    jest.spyOn(fixture.fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    jest
      .spyOn(fixture.fixture.resourceRepository, 'find')
      .mockResolvedValue([{ id: 1, createdAt: oldCreatedAt } as Resource]);

    // 3 sessions < 10 threshold
    jest
      .spyOn(fixture.fixture.usageRepository, 'query')
      .mockResolvedValue([
        { resourceId: 1, scheduleId: fixture.fixture.scheduleId, totalMinutes: '0', totalCount: '3' },
      ]);

    await fixture.fixture.service.evaluateAll();

    expect(fixture.fixture.maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
  });
}
