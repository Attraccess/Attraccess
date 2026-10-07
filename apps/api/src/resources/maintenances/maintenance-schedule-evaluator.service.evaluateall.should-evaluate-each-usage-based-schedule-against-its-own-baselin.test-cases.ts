import {
  Resource,
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleTriggerType,
} from '@attraccess/database-entities';
import { formatDbDate } from './maintenance-schedule-evaluator.service';
import { registerEvaluateallScopeFixture } from './maintenance-schedule-evaluator.service.evaluateall-a68b2d.test-fixture';
export function registerShouldEvaluateEachUsageBasedScheduleAgainstItsOwnBaselinPart12Cases(
  fixture: ReturnType<typeof registerEvaluateallScopeFixture>,
) {
  it('should evaluate each usage-based schedule against its own baseline, not a shared one', async () => {
    const otherScheduleId = fixture.fixture.scheduleId + 1;
    const resourceCreatedAt = new Date('2024-01-01T00:00:00.000Z');
    const recentlyServiced = new Date('2026-06-01T00:00:00.000Z');

    jest.spyOn(fixture.fixture.scheduleRepository, 'find').mockResolvedValue([
      // Never serviced -> baseline is resource createdAt, plenty of usage accumulated
      {
        id: fixture.fixture.scheduleId,
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

    const maintenanceQb = fixture.fixture.createQueryBuilderMock();
    maintenanceQb.getRawMany
      .mockResolvedValueOnce([
        { resourceId: 1, scheduleId: otherScheduleId, lastEndTime: recentlyServiced.toISOString() },
      ])
      .mockResolvedValueOnce([]);
    jest.spyOn(fixture.fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    jest
      .spyOn(fixture.fixture.resourceRepository, 'find')
      .mockResolvedValue([{ id: 1, createdAt: resourceCreatedAt } as Resource]);

    fixture.fixture.operatingAttribution.getDurationsForWindows.mockResolvedValue(
      new Map([
        [`${fixture.fixture.scheduleId}:1`, { sessionDurationMs: 900 * 60_000, operatingDurationMs: 0 }],
        [`${otherScheduleId}:1`, { sessionDurationMs: 30 * 60_000, operatingDurationMs: 0 }],
      ]),
    );
    // Same resource, different service-cycle baselines.
    const querySpy = jest.spyOn(fixture.fixture.usageRepository, 'query').mockResolvedValue([
      {
        resourceId: 1,
        scheduleId: fixture.fixture.scheduleId,
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

    await fixture.fixture.service.evaluateAll();

    // Resolve all service-cycle baselines together, then derive exact durations per window.
    expect(querySpy).toHaveBeenCalledTimes(1);
    expect(querySpy.mock.calls[0][0]).toContain('resource_maintenance');
    expect(querySpy.mock.calls[0][0]).not.toContain('resource_usage');
    expect(fixture.fixture.operatingAttribution.getDurationsForWindows).toHaveBeenNthCalledWith(
      1,
      [
        { key: `${fixture.fixture.scheduleId}:1`, resourceId: 1, start: resourceCreatedAt },
        { key: `${otherScheduleId}:1`, resourceId: 1, start: recentlyServiced },
      ],
      expect.any(Date),
    );

    // Both schedules must be sent to SQL with their resource-created fallback baseline.
    const params = querySpy.mock.calls[0][1] as unknown[];
    expect(params).toEqual([
      1,
      fixture.fixture.scheduleId,
      formatDbDate(resourceCreatedAt),
      1,
      otherScheduleId,
      formatDbDate(resourceCreatedAt),
      expect.any(String),
    ]);

    // Only the never-serviced schedule crossed its threshold
    expect(fixture.fixture.maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledTimes(1);
    expect(fixture.fixture.maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledWith(
      1,
      fixture.fixture.scheduleId,
      expect.any(String),
      expect.anything(),
      false,
    );
  });
}
