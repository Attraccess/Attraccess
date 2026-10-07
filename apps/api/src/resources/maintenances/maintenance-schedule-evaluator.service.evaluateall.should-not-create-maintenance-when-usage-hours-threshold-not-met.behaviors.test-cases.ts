import {
  Resource,
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleTriggerType,
} from '@attraccess/database-entities';
import { registerEvaluateallScopeFixture } from './maintenance-schedule-evaluator.service.evaluateall-a68b2d.test-fixture';

export function registerShouldNotCreateMaintenanceWhenUsageHoursThresholdNotMetPart9Cases(
  fixture: ReturnType<typeof registerEvaluateallScopeFixture>,
) {
  it('should not create maintenance when USAGE_HOURS threshold not met in bulk data', async () => {
    const oldCreatedAt = new Date('2024-01-01T00:00:00.000Z');

    jest.spyOn(fixture.fixture.scheduleRepository, 'find').mockResolvedValue([
      {
        id: fixture.fixture.scheduleId,
        resourceId: 1,
        enabled: true,
        triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_HOURS,
        usageHoursConfig: { duration: 10, unit: 'HOURS' as const }, // 600 minutes threshold
        usageCountConfig: null,
        timeIntervalConfig: null,
      } as ResourceMaintenanceSchedule,
    ]);

    const maintenanceQb = fixture.fixture.createQueryBuilderMock();
    maintenanceQb.getRawMany.mockResolvedValue([]);
    jest.spyOn(fixture.fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    jest
      .spyOn(fixture.fixture.resourceRepository, 'find')
      .mockResolvedValue([{ id: 1, createdAt: oldCreatedAt } as Resource]);

    fixture.fixture.operatingAttribution.getDurationsForWindows.mockResolvedValue(
      new Map([[`${fixture.fixture.scheduleId}:1`, { sessionDurationMs: 100 * 60_000, operatingDurationMs: 0 }]]),
    );
    // 100 minutes < 600 minutes threshold
    jest
      .spyOn(fixture.fixture.usageRepository, 'query')
      .mockResolvedValue([
        { resourceId: 1, scheduleId: fixture.fixture.scheduleId, totalMinutes: '100', totalCount: '2' },
      ]);

    await fixture.fixture.service.evaluateAll();

    expect(fixture.fixture.maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
  });
}

export function registerShouldNotEmitSideEffectsWhenTheWriteTransactionFailsToPart14Cases(
  fixture: ReturnType<typeof registerEvaluateallScopeFixture>,
) {
  it('should not emit side effects when the write transaction fails to commit', async () => {
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
    ]);

    const maintenanceQb = fixture.fixture.createQueryBuilderMock();
    maintenanceQb.getRawMany.mockResolvedValue([]);
    jest.spyOn(fixture.fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    jest
      .spyOn(fixture.fixture.resourceRepository, 'find')
      .mockResolvedValue([{ id: 1, createdAt: new Date('2024-01-01T00:00:00.000Z') } as Resource]);

    jest.spyOn(fixture.fixture.scheduleRepository.manager, 'transaction').mockImplementation(async (callback) => {
      await callback({ query: jest.fn().mockResolvedValue([]) } as never);
      throw new Error('transaction commit failed');
    });

    await expect(fixture.fixture.service.evaluateAll()).resolves.toBeUndefined();

    expect(fixture.fixture.maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledTimes(1);
    expect(fixture.fixture.maintenanceService.emitScheduledMaintenanceCreated).not.toHaveBeenCalled();
  });
}

export function registerShouldNotRunConcurrentEvaluationsWhenLockIsHeldPart17Cases(
  fixture: ReturnType<typeof registerEvaluateallScopeFixture>,
) {
  it('should not run concurrent evaluations when lock is held', async () => {
    // Use a pending Promise so the first call holds the lock across microtask boundaries,
    // ensuring the second call observes the lock before the first finishes.
    let resolveFind!: (val: ResourceMaintenanceSchedule[]) => void;
    const pendingFind = new Promise<ResourceMaintenanceSchedule[]>((res) => {
      resolveFind = res;
    });
    jest.spyOn(fixture.fixture.scheduleRepository, 'find').mockReturnValue(pendingFind);

    const firstCall = fixture.fixture.service.evaluateAll();
    // Second call fires while firstCall is still awaiting scheduleRepository.find
    const secondCall = fixture.fixture.service.evaluateAll();

    resolveFind([]);
    await Promise.all([firstCall, secondCall]);

    // find called once: second call skipped due to lock held by first
    expect(fixture.fixture.scheduleRepository.find).toHaveBeenCalledTimes(1);
  });
}

export function registerShouldSkipOrphanedSchedulesWithoutIssuingAnInvalidEmptyPPart4Cases(
  fixture: ReturnType<typeof registerEvaluateallScopeFixture>,
) {
  it('should skip orphaned schedules without issuing an invalid empty-pairs query', async () => {
    jest.spyOn(fixture.fixture.scheduleRepository, 'find').mockResolvedValue([
      {
        id: fixture.fixture.scheduleId,
        resourceId: 1,
        enabled: true,
        triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
        timeIntervalConfig: { duration: 1, unit: 'DAYS' },
      } as ResourceMaintenanceSchedule,
    ]);
    jest.spyOn(fixture.fixture.resourceRepository, 'find').mockResolvedValue([]);
    const querySpy = jest.spyOn(fixture.fixture.usageRepository, 'query');

    await fixture.fixture.service.evaluateAll();

    expect(querySpy).not.toHaveBeenCalled();
    expect(fixture.fixture.maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
  });
}

export function registerShouldSkipResourcesThatAlreadyHaveActiveMaintenancePart6Cases(
  fixture: ReturnType<typeof registerEvaluateallScopeFixture>,
) {
  it('should skip resources that already have active maintenance', async () => {
    const oldCreatedAt = new Date('2024-01-01T00:00:00.000Z');

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

    // The combined evaluation query reports this resource as active.
    const maintenanceQb = fixture.fixture.createQueryBuilderMock();
    maintenanceQb.getRawMany
      .mockResolvedValueOnce([]) // first call: last done query
      .mockResolvedValueOnce([{ resourceId: 1, scheduleId: fixture.fixture.scheduleId }]); // second call: active query
    jest.spyOn(fixture.fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    jest
      .spyOn(fixture.fixture.resourceRepository, 'find')
      .mockResolvedValue([{ id: 1, createdAt: oldCreatedAt } as Resource]);
    jest.spyOn(fixture.fixture.usageRepository, 'query').mockResolvedValue([
      {
        resourceId: 1,
        scheduleId: fixture.fixture.scheduleId,
        hasActiveMaintenance: 1,
        totalMinutes: 0,
        totalCount: 0,
      },
    ]);

    await fixture.fixture.service.evaluateAll();

    expect(fixture.fixture.maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
  });
}

export function registerShouldUseLastDoneMaintenanceEndtimeAsBaselineNotResourcePart16Cases(
  fixture: ReturnType<typeof registerEvaluateallScopeFixture>,
) {
  it('should use last-done maintenance endTime as baseline, not resource createdAt', async () => {
    const resourceCreatedAt = new Date('2024-01-01T00:00:00.000Z');
    // Last maintenance done 2 days ago — not yet 30 days, so should NOT trigger
    const lastDoneEndTime = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

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
    jest.spyOn(fixture.fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    jest
      .spyOn(fixture.fixture.resourceRepository, 'find')
      .mockResolvedValue([{ id: 1, createdAt: resourceCreatedAt } as Resource]);
    jest.spyOn(fixture.fixture.usageRepository, 'query').mockResolvedValue([
      {
        resourceId: 1,
        scheduleId: fixture.fixture.scheduleId,
        baseline: lastDoneEndTime.toISOString(),
        totalMinutes: 0,
        totalCount: 0,
      },
    ]);

    await fixture.fixture.service.evaluateAll();

    // Should NOT trigger because only 2 days elapsed since last done (< 30 day threshold)
    expect(fixture.fixture.maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
  });
}
