import {
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleTriggerType,
  Resource,
} from '@attraccess/database-entities';
import { registerEvaluateallScopeFixture } from './maintenance-schedule-evaluator.service.evaluateall-a68b2d.test-fixture';

export function registerRechecksADurationCycleCompletedBetweenTheBulkReadAndMaiPart8Cases(
  fixture: ReturnType<typeof registerEvaluateallScopeFixture>,
) {
  it('rechecks a duration cycle completed between the bulk read and maintenance creation', async () => {
    jest.spyOn(fixture.fixture.scheduleRepository, 'find').mockResolvedValue([
      {
        id: fixture.fixture.scheduleId,
        resourceId: 1,
        enabled: true,
        triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_HOURS,
        usageHoursConfig: { duration: 1, unit: 'HOURS' },
      } as ResourceMaintenanceSchedule,
    ]);
    fixture.fixture.operatingAttribution.getDurationsForWindows
      .mockResolvedValueOnce(
        new Map([[`${fixture.fixture.scheduleId}:1`, { sessionDurationMs: 120 * 60_000, operatingDurationMs: 0 }]]),
      )
      .mockResolvedValueOnce(
        new Map([[`${fixture.fixture.scheduleId}:1`, { sessionDurationMs: 0, operatingDurationMs: 0 }]]),
      );
    const completedAt = new Date();
    jest.spyOn(fixture.fixture.service, 'getBaselineDate').mockResolvedValue(completedAt);

    await fixture.fixture.service.evaluateAll();

    expect(fixture.fixture.operatingAttribution.getDurationsForWindows).toHaveBeenNthCalledWith(
      2,
      [{ key: `${fixture.fixture.scheduleId}:1`, resourceId: 1, start: completedAt }],
      expect.any(Date),
      expect.anything(),
    );
    expect(fixture.fixture.maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
  });
}

export function registerShouldChunkUsageEvaluationQueriesBelowSqliteBindLimitsPart5Cases(
  fixture: ReturnType<typeof registerEvaluateallScopeFixture>,
) {
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
    jest.spyOn(fixture.fixture.scheduleRepository, 'find').mockResolvedValue(schedules);
    jest
      .spyOn(fixture.fixture.resourceRepository, 'find')
      .mockResolvedValue(schedules.map(({ resourceId: id }) => ({ id, createdAt: oldCreatedAt }) as Resource));
    const querySpy = jest.spyOn(fixture.fixture.usageRepository, 'query').mockResolvedValue([]);

    await fixture.fixture.service.evaluateAll();

    expect(querySpy).toHaveBeenCalledTimes(2);
    expect(querySpy.mock.calls.map(([, params]) => (params as unknown[]).length)).toEqual([32_764, 4]);
  });
}

export function registerShouldContinueCreatingOtherDueMaintenancesWhenAStaleActiPart2Cases(
  fixture: ReturnType<typeof registerEvaluateallScopeFixture>,
) {
  it('should continue creating other due maintenances when a stale active check succeeds', async () => {
    const oldCreatedAt = new Date('2024-01-01T00:00:00.000Z');
    jest.spyOn(fixture.fixture.scheduleRepository, 'find').mockResolvedValue([
      {
        id: fixture.fixture.scheduleId,
        resourceId: 1,
        enabled: true,
        triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
        timeIntervalConfig: { duration: 30, unit: 'DAYS' },
      } as ResourceMaintenanceSchedule,
      {
        id: fixture.fixture.scheduleId + 1,
        resourceId: 2,
        enabled: true,
        triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
        timeIntervalConfig: { duration: 30, unit: 'DAYS' },
      } as ResourceMaintenanceSchedule,
    ]);
    const maintenanceQb = fixture.fixture.createQueryBuilderMock();
    maintenanceQb.getRawMany.mockResolvedValue([]);
    jest.spyOn(fixture.fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    jest
      .spyOn(fixture.fixture.resourceRepository, 'find')
      .mockResolvedValue([
        { id: 1, createdAt: oldCreatedAt } as Resource,
        { id: 2, createdAt: oldCreatedAt } as Resource,
      ]);
    jest
      .spyOn(fixture.fixture.maintenanceService, 'hasActiveMaintenance')
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await fixture.fixture.service.evaluateAll();

    expect(fixture.fixture.scheduleRepository.manager.transaction).toHaveBeenCalledTimes(1);
    expect(fixture.fixture.maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledTimes(1);
    expect(fixture.fixture.maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledWith(
      2,
      fixture.fixture.scheduleId + 1,
      expect.any(String),
      expect.anything(),
      false,
    );
  });
}

export function registerShouldContinueCreatingScheduledMaintenancesWhenOneCreationPart13Cases(
  fixture: ReturnType<typeof registerEvaluateallScopeFixture>,
) {
  it('should continue creating scheduled maintenances when one creation fails', async () => {
    jest.spyOn(fixture.fixture.scheduleRepository, 'find').mockResolvedValue([
      {
        id: fixture.fixture.scheduleId,
        resourceId: 1,
        enabled: true,
        triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
        usageHoursConfig: null,
        usageCountConfig: null,
        timeIntervalConfig: { duration: 1, unit: 'DAYS' },
      } as ResourceMaintenanceSchedule,
      {
        id: fixture.fixture.scheduleId + 1,
        resourceId: 2,
        enabled: true,
        triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
        usageHoursConfig: null,
        usageCountConfig: null,
        timeIntervalConfig: { duration: 1, unit: 'DAYS' },
      } as ResourceMaintenanceSchedule,
    ]);

    const maintenanceQb = fixture.fixture.createQueryBuilderMock();
    maintenanceQb.getRawMany.mockResolvedValue([]);
    jest.spyOn(fixture.fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    jest
      .spyOn(fixture.fixture.resourceRepository, 'find')
      .mockResolvedValue([
        { id: 1, createdAt: new Date('2024-01-01T00:00:00.000Z') } as Resource,
        { id: 2, createdAt: new Date('2024-01-01T00:00:00.000Z') } as Resource,
      ]);

    jest
      .spyOn(fixture.fixture.maintenanceService, 'createMaintenanceFromSchedule')
      .mockRejectedValueOnce(new Error('resource vanished mid-run'));

    await expect(fixture.fixture.service.evaluateAll()).resolves.toBeUndefined();

    expect(fixture.fixture.scheduleRepository.manager.transaction).toHaveBeenCalledTimes(1);
    expect(fixture.fixture.maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledTimes(2);
    expect(fixture.fixture.maintenanceService.emitScheduledMaintenanceCreated).toHaveBeenCalledWith(2, 1);
  });
}

export function registerShouldCreateMaintenancesForResourcesWhoseTimeIntervalScheCases(
  fixture: ReturnType<typeof registerEvaluateallScopeFixture>,
) {
  it('should create maintenances for resources whose TIME_INTERVAL schedule is due', async () => {
    const oldCreatedAt = new Date('2024-01-01T00:00:00.000Z');

    // Two resources with TIME_INTERVAL schedules due (baseline is createdAt, > 30 days ago)
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
      {
        id: fixture.fixture.scheduleId + 1,
        resourceId: 2,
        enabled: true,
        triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
        usageHoursConfig: null,
        usageCountConfig: null,
        timeIntervalConfig: { duration: 30, unit: 'DAYS' },
      } as ResourceMaintenanceSchedule,
    ]);

    // No last-done maintenances, no active maintenances
    const maintenanceQb = fixture.fixture.createQueryBuilderMock();
    maintenanceQb.getRawMany.mockResolvedValue([]);
    jest.spyOn(fixture.fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    // Resources with old createdAt (> 30 days) so TIME_INTERVAL triggers
    jest
      .spyOn(fixture.fixture.resourceRepository, 'find')
      .mockResolvedValue([
        { id: 1, createdAt: oldCreatedAt } as Resource,
        { id: 2, createdAt: oldCreatedAt } as Resource,
      ]);

    await fixture.fixture.service.evaluateAll();

    expect(fixture.fixture.scheduleRepository.manager.transaction).toHaveBeenCalledTimes(1);
    expect(fixture.fixture.maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledTimes(2);
    expect(fixture.fixture.maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledWith(
      1,
      fixture.fixture.scheduleId,
      expect.any(String),
      expect.anything(),
      false,
    );
    expect(fixture.fixture.maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledWith(
      2,
      fixture.fixture.scheduleId + 1,
      expect.any(String),
      expect.anything(),
      false,
    );
    expect(fixture.fixture.maintenanceService.emitScheduledMaintenanceCreated).toHaveBeenCalledWith(1, 1);
    expect(fixture.fixture.maintenanceService.emitScheduledMaintenanceCreated).toHaveBeenCalledWith(2, 1);
    expect(fixture.fixture.maintenanceService.hasActiveMaintenance).toHaveBeenCalledWith(1, expect.anything());
    expect(fixture.fixture.maintenanceService.hasActiveMaintenance).toHaveBeenCalledWith(2, expect.anything());
  });
}
