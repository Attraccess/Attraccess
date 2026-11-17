import {
  registerMaintenanceScheduleEvaluatorServiceFixture,
  scheduleRecord,
} from './maintenance-schedule-evaluator.service.maintenance-schedule-evaluator-service.test-fixture';

import {
  ResourceMaintenanceScheduleDurationBasis,
  ResourceMaintenanceScheduleTriggerType,
} from '@attraccess/application-models';
import { MaintenanceResourceEvaluation } from './evaluation/resource-evaluation';

const OLD_CREATED_AT = new Date('2024-01-01T00:00:00.000Z');
const { TIME_INTERVAL, USAGE_HOURS, USAGE_COUNT } = ResourceMaintenanceScheduleTriggerType;

describe('MaintenanceScheduleEvaluatorService', () => {
  const fixture = registerMaintenanceScheduleEvaluatorServiceFixture();

  const dueInterval = (id: number, resourceId: number, duration = 30) =>
    scheduleRecord({ id, resourceId, triggerType: TIME_INTERVAL, timeIntervalConfig: timeConfig(id, duration) });
  const timeConfig = (scheduleId: number, duration: number) => ({
    id: scheduleId,
    scheduleId,
    duration,
    unit: 'DAYS' as const,
  });
  const hoursSchedule = (id: number, resourceId: number, duration: number) =>
    scheduleRecord({
      id,
      resourceId,
      triggerType: USAGE_HOURS,
      usageHoursConfig: { id, scheduleId: id, duration, unit: 'HOURS' as const },
    });
  const countSchedule = (id: number, resourceId: number, thresholdSessions: number) =>
    scheduleRecord({
      id,
      resourceId,
      triggerType: USAGE_COUNT,
      usageCountConfig: { id, scheduleId: id, thresholdSessions },
    });
  const createdAt = (...resourceIds: number[]) => new Map(resourceIds.map((id) => [id, OLD_CREATED_AT]));
  const created = () => fixture.maintenanceService.createMaintenanceFromSchedule as jest.Mock;

  it('should be defined', () => {
    expect(fixture.service).toBeDefined();
  });

  describe('getBaselineDate', () => {
    it('reads the baseline of the schedule on the application connection', async () => {
      const result = await fixture.service.getBaselineDate(fixture.resourceId, fixture.scheduleId);
      expect(result).toEqual(fixture.baselineDate);
      expect(fixture.currentView.baselineDate).toHaveBeenCalledWith(fixture.resourceId, fixture.scheduleId);
    });

    it('reads the baseline inside the given view', async () => {
      const lastEnd = new Date('2025-02-01T12:00:00.000Z');
      fixture.view.baselineDate.mockResolvedValue(lastEnd);

      const result = await fixture.service.getBaselineDate(fixture.resourceId, fixture.scheduleId, fixture.view);
      expect(result).toEqual(lastEnd);
      expect(fixture.currentView.baselineDate).not.toHaveBeenCalled();
    });
  });

  it('selects total operating duration independently of session duration', async () => {
    fixture.operatingAttribution.getDurationsForWindows.mockResolvedValue(
      new Map([
        [`${fixture.scheduleId}:${fixture.resourceId}`, { sessionDurationMs: 0, operatingDurationMs: 60 * 60_000 }],
      ]),
    );
    const triggered = await fixture.service.shouldTrigger(
      scheduleRecord({
        id: fixture.scheduleId,
        resourceId: fixture.resourceId,
        triggerType: USAGE_HOURS,
        durationBasis: ResourceMaintenanceScheduleDurationBasis.ATTRIBUTABLE_OPERATING_DURATION,
        usageHoursConfig: { id: 1, scheduleId: fixture.scheduleId, duration: 1, unit: 'HOURS' as const },
      }),
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
    it('does not open a transaction for resources without enabled schedules', async () => {
      fixture.store.hasEnabledSchedules.mockResolvedValue(false);
      await expect(fixture.service.evaluateResource(fixture.resourceId)).resolves.toBeUndefined();
      expect(fixture.store.inTransaction).not.toHaveBeenCalled();
      expect(fixture.store.inSnapshot).not.toHaveBeenCalled();
    });

    it.each([
      { kind: 'manual', activeScheduleId: null },
      { kind: 'another schedule', activeScheduleId: fixture.scheduleId + 1 },
    ])('does not create a second maintenance while $kind maintenance is active', async ({ activeScheduleId }) => {
      fixture.view.enabledSchedules.mockResolvedValue([dueInterval(fixture.scheduleId, fixture.resourceId)]);
      jest
        .spyOn(Reflect.get(fixture.service, 'evaluation') as MaintenanceResourceEvaluation, 'shouldTrigger')
        .mockResolvedValue(true);
      // The resource has an active record, but it does not belong to the schedule being evaluated.
      jest
        .spyOn(fixture.maintenanceService, 'hasActiveMaintenance')
        .mockImplementation(async (filter) => typeof filter === 'number' || filter.scheduleId === activeScheduleId);

      await fixture.service.evaluateResource(fixture.resourceId);

      expect(created()).not.toHaveBeenCalled();
    });

    it('should not create maintenance when resource has active maintenance', async () => {
      jest.spyOn(fixture.maintenanceService, 'hasActiveMaintenance').mockResolvedValue(true);
      fixture.view.enabledSchedules.mockResolvedValue([hoursSchedule(fixture.scheduleId, fixture.resourceId, 1)]);

      await fixture.service.evaluateResource(fixture.resourceId);

      expect(created()).not.toHaveBeenCalled();
    });

    it('should create maintenance when USAGE_HOURS threshold met and no active maintenance', async () => {
      fixture.view.enabledSchedules.mockResolvedValue([hoursSchedule(fixture.scheduleId, fixture.resourceId, 1)]);
      fixture.operatingAttribution.getDurationsForWindows.mockResolvedValue(
        new Map([
          [`${fixture.scheduleId}:${fixture.resourceId}`, { sessionDurationMs: 120 * 60_000, operatingDurationMs: 0 }],
        ]),
      );

      await fixture.service.evaluateResource(fixture.resourceId);

      expect(created()).toHaveBeenCalledWith(
        fixture.resourceId,
        fixture.scheduleId,
        expect.any(String),
        fixture.view.context,
        false,
      );
      const parsed = JSON.parse(created().mock.calls[0][2]);
      expect(parsed.i18nKey).toBe('reason.auto.usageHoursHours');
      expect(parsed.details.duration).toBe(1);
      expect(fixture.maintenanceService.emitScheduledMaintenanceCreated).toHaveBeenCalledWith(fixture.resourceId, 1);
    });

    it('should not create when USAGE_HOURS threshold not met', async () => {
      fixture.view.enabledSchedules.mockResolvedValue([hoursSchedule(fixture.scheduleId, fixture.resourceId, 10)]);
      fixture.operatingAttribution.getDurationsForWindows.mockResolvedValue(
        new Map([
          [`${fixture.scheduleId}:${fixture.resourceId}`, { sessionDurationMs: 100 * 60_000, operatingDurationMs: 0 }],
        ]),
      );

      await fixture.service.evaluateResource(fixture.resourceId);

      expect(created()).not.toHaveBeenCalled();
    });

    it('should count the completed sessions of a USAGE_COUNT schedule since its baseline', async () => {
      fixture.view.enabledSchedules.mockResolvedValue([countSchedule(fixture.scheduleId, fixture.resourceId, 5)]);
      fixture.view.completedSessionCountSince.mockResolvedValue(5);

      await fixture.service.evaluateResource(fixture.resourceId);

      expect(fixture.view.completedSessionCountSince).toHaveBeenCalledWith(fixture.resourceId, fixture.baselineDate);
      expect(created()).toHaveBeenCalledWith(
        fixture.resourceId,
        fixture.scheduleId,
        expect.any(String),
        fixture.view.context,
        false,
      );
    });

    it('should create when TIME_INTERVAL threshold due', async () => {
      fixture.view.baselineDate.mockResolvedValue(new Date('2024-12-01T00:00:00.000Z'));
      fixture.view.enabledSchedules.mockResolvedValue([dueInterval(fixture.scheduleId, fixture.resourceId)]);

      await fixture.service.evaluateResource(fixture.resourceId);

      expect(created()).toHaveBeenCalledWith(
        fixture.resourceId,
        fixture.scheduleId,
        expect.any(String),
        fixture.view.context,
        false,
      );
      const parsed = JSON.parse(created().mock.calls[0][2]);
      expect(parsed.i18nKey).toBe('reason.auto.timeIntervalDays');
      expect(parsed.details.duration).toBe(30);
    });

    it('creates nothing when no schedule is enabled any more inside the transaction', async () => {
      fixture.view.enabledSchedules.mockResolvedValue([]);

      await fixture.service.evaluateResource(fixture.resourceId);

      expect(created()).not.toHaveBeenCalled();
    });
  });

  describe('evaluateResource on engines with snapshot reads', () => {
    const snapshotSchedule = () => dueInterval(fixture.scheduleId, fixture.resourceId);

    beforeEach(() => {
      Object.assign(fixture.store, { snapshotReads: true });
      fixture.view.enabledSchedules.mockResolvedValue([snapshotSchedule()]);
    });

    it('reads in the snapshot, validates in a transaction and creates the maintenance there', async () => {
      fixture.view.baselineDate.mockResolvedValue(OLD_CREATED_AT);

      await fixture.service.evaluateResource(fixture.resourceId);

      expect(fixture.store.inSnapshot).toHaveBeenCalledTimes(1);
      expect(fixture.store.inTransaction).toHaveBeenCalledTimes(1);
      expect(created()).toHaveBeenCalledWith(
        fixture.resourceId,
        fixture.scheduleId,
        expect.any(String),
        fixture.view.context,
        false,
      );
      expect(fixture.maintenanceService.emitScheduledMaintenanceCreated).toHaveBeenCalledWith(fixture.resourceId, 1);
    });

    it('does not open a write transaction when the snapshot finds nothing due', async () => {
      fixture.view.baselineDate.mockResolvedValue(new Date());

      await fixture.service.evaluateResource(fixture.resourceId);

      expect(fixture.store.inTransaction).not.toHaveBeenCalled();
      expect(created()).not.toHaveBeenCalled();
    });

    it('skips the snapshot when a maintenance is already running', async () => {
      jest.spyOn(fixture.maintenanceService, 'hasActiveMaintenance').mockResolvedValue(true);

      await fixture.service.evaluateResource(fixture.resourceId);

      expect(fixture.view.enabledSchedules).not.toHaveBeenCalled();
      expect(fixture.store.inTransaction).not.toHaveBeenCalled();
    });

    it('rejects the snapshot and evaluates the resource again when the baseline moved', async () => {
      jest.useFakeTimers();
      try {
        // The snapshot reads the baseline twice (candidate baseline, trigger check); the transaction sees it moved.
        fixture.view.baselineDate
          .mockResolvedValueOnce(OLD_CREATED_AT)
          .mockResolvedValueOnce(OLD_CREATED_AT)
          .mockResolvedValue(new Date());

        await fixture.service.evaluateResource(fixture.resourceId);

        expect(created()).not.toHaveBeenCalled();
        // The debounced requeue evaluates the resource once more.
        const evaluateAgain = jest.spyOn(fixture.service, 'evaluateResource').mockResolvedValue();
        jest.runAllTimers();
        expect(evaluateAgain).toHaveBeenCalledWith(fixture.resourceId);
      } finally {
        await fixture.service.onModuleDestroy();
        jest.useRealTimers();
      }
    });

    it('rejects the snapshot when the schedule definition changed', async () => {
      jest.useFakeTimers();
      try {
        fixture.view.baselineDate.mockResolvedValue(OLD_CREATED_AT);
        fixture.view.enabledSchedules
          .mockResolvedValueOnce([snapshotSchedule()])
          .mockResolvedValue([dueInterval(fixture.scheduleId, fixture.resourceId, 1_000)]);

        await fixture.service.evaluateResource(fixture.resourceId);

        expect(created()).not.toHaveBeenCalled();
      } finally {
        await fixture.service.onModuleDestroy();
        jest.useRealTimers();
      }
    });

    it('rejects the snapshot when the duration history changed', async () => {
      jest.useFakeTimers();
      try {
        fixture.view.enabledSchedules.mockResolvedValue([hoursSchedule(fixture.scheduleId, fixture.resourceId, 1)]);
        fixture.operatingAttribution.getDurationsForWindows.mockResolvedValue(
          new Map([
            [
              `${fixture.scheduleId}:${fixture.resourceId}`,
              { sessionDurationMs: 120 * 60_000, operatingDurationMs: 0 },
            ],
          ]),
        );
        fixture.view.durationFingerprint.mockResolvedValueOnce('before').mockResolvedValue('after');

        await fixture.service.evaluateResource(fixture.resourceId);

        expect(created()).not.toHaveBeenCalled();
      } finally {
        await fixture.service.onModuleDestroy();
        jest.useRealTimers();
      }
    });

    it('releases the store when the service shuts down', async () => {
      await fixture.service.onModuleDestroy();
      expect(fixture.store.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('evaluateAll', () => {
    it('should create maintenances for resources whose TIME_INTERVAL schedule is due', async () => {
      // Two resources with TIME_INTERVAL schedules due (baseline is createdAt, > 30 days ago)
      fixture.store.listEnabledSchedules.mockResolvedValue([
        dueInterval(fixture.scheduleId, 1),
        dueInterval(fixture.scheduleId + 1, 2),
      ]);
      fixture.store.findResourceCreatedAt.mockResolvedValue(createdAt(1, 2));

      await fixture.service.evaluateAll();

      expect(fixture.store.inTransaction).toHaveBeenCalledTimes(1);
      expect(created()).toHaveBeenCalledTimes(2);
      expect(created()).toHaveBeenCalledWith(1, fixture.scheduleId, expect.any(String), fixture.view.context, false);
      expect(created()).toHaveBeenCalledWith(
        2,
        fixture.scheduleId + 1,
        expect.any(String),
        fixture.view.context,
        false,
      );
      expect(fixture.maintenanceService.emitScheduledMaintenanceCreated).toHaveBeenCalledWith(1, 1);
      expect(fixture.maintenanceService.emitScheduledMaintenanceCreated).toHaveBeenCalledWith(2, 1);
      expect(fixture.maintenanceService.hasActiveMaintenance).toHaveBeenCalledWith(1, fixture.view.context);
      expect(fixture.maintenanceService.hasActiveMaintenance).toHaveBeenCalledWith(2, fixture.view.context);
    });

    it('should revalidate every due resource through its own evaluation on engines with snapshot reads', async () => {
      Object.assign(fixture.store, { snapshotReads: true });
      fixture.store.listEnabledSchedules.mockResolvedValue([dueInterval(fixture.scheduleId, 1)]);
      fixture.store.findResourceCreatedAt.mockResolvedValue(createdAt(1));
      const evaluate = jest.spyOn(fixture.service, 'evaluateResource').mockResolvedValue();

      await fixture.service.evaluateAll();

      expect(evaluate).toHaveBeenCalledWith(1);
      expect(fixture.store.inTransaction).not.toHaveBeenCalled();
    });

    it('should write due schedules in bounded transactions', async () => {
      const dueSchedules = Array.from({ length: 101 }, (_, index) =>
        dueInterval(fixture.scheduleId + index, index + 1),
      );
      fixture.store.listEnabledSchedules.mockResolvedValue(dueSchedules);
      fixture.store.findResourceCreatedAt.mockResolvedValue(createdAt(...dueSchedules.map((s) => s.resourceId)));
      (fixture.maintenanceService.hasActiveMaintenance as jest.Mock).mockImplementation((id: number) =>
        Promise.resolve(id === 101),
      );

      await fixture.service.evaluateAll();

      expect(fixture.store.inTransaction).toHaveBeenCalledTimes(2);
      expect(fixture.maintenanceService.hasActiveMaintenance).toHaveBeenCalledWith(101, expect.anything());
      expect(created()).toHaveBeenCalledTimes(100);
      expect(created()).not.toHaveBeenCalledWith(101, expect.anything(), expect.anything(), expect.anything(), false);
    });

    it('should continue creating other due maintenances when a stale active check succeeds', async () => {
      fixture.store.listEnabledSchedules.mockResolvedValue([
        dueInterval(fixture.scheduleId, 1),
        dueInterval(fixture.scheduleId + 1, 2),
      ]);
      fixture.store.findResourceCreatedAt.mockResolvedValue(createdAt(1, 2));
      jest
        .spyOn(fixture.maintenanceService, 'hasActiveMaintenance')
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      await fixture.service.evaluateAll();

      expect(fixture.store.inTransaction).toHaveBeenCalledTimes(1);
      expect(created()).toHaveBeenCalledTimes(1);
      expect(created()).toHaveBeenCalledWith(
        2,
        fixture.scheduleId + 1,
        expect.any(String),
        fixture.view.context,
        false,
      );
    });

    it('should not create maintenance when TIME_INTERVAL not yet due', async () => {
      // Schedule due in 30 days, resource created 1 day ago
      const recentCreatedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
      fixture.store.listEnabledSchedules.mockResolvedValue([dueInterval(fixture.scheduleId, 1)]);
      fixture.store.findResourceCreatedAt.mockResolvedValue(new Map([[1, recentCreatedAt]]));

      await fixture.service.evaluateAll();

      expect(created()).not.toHaveBeenCalled();
      expect(fixture.store.loadServiceCycleStates).toHaveBeenCalledTimes(1);
      expect(fixture.store.inTransaction).not.toHaveBeenCalled();
    });

    it('should skip orphaned schedules without asking for the service cycle of unknown resources', async () => {
      fixture.store.listEnabledSchedules.mockResolvedValue([dueInterval(fixture.scheduleId, 1)]);
      fixture.store.findResourceCreatedAt.mockResolvedValue(new Map());

      await fixture.service.evaluateAll();

      expect(fixture.store.loadServiceCycleStates).not.toHaveBeenCalled();
      expect(created()).not.toHaveBeenCalled();
    });

    it('should skip resources that already have active maintenance', async () => {
      fixture.store.listEnabledSchedules.mockResolvedValue([dueInterval(fixture.scheduleId, 1)]);
      fixture.store.findResourceCreatedAt.mockResolvedValue(createdAt(1));
      fixture.store.loadServiceCycleStates.mockResolvedValue([
        {
          resourceId: 1,
          scheduleId: fixture.scheduleId,
          baseline: OLD_CREATED_AT,
          hasActiveMaintenance: true,
          completedSessions: 0,
        },
      ]);

      await fixture.service.evaluateAll();

      expect(created()).not.toHaveBeenCalled();
    });

    it('should evaluate USAGE_HOURS using bulk-fetched usage data', async () => {
      fixture.store.listEnabledSchedules.mockResolvedValue([hoursSchedule(fixture.scheduleId, 1, 1)]);
      fixture.store.findResourceCreatedAt.mockResolvedValue(createdAt(1));
      fixture.operatingAttribution.getDurationsForWindows.mockResolvedValue(
        new Map([[`${fixture.scheduleId}:1`, { sessionDurationMs: 120 * 60_000, operatingDurationMs: 0 }]]),
      );

      await fixture.service.evaluateAll();

      expect(created()).toHaveBeenCalledWith(1, fixture.scheduleId, expect.any(String), expect.anything(), false);
    });

    it('rechecks a duration cycle completed between the bulk read and maintenance creation', async () => {
      fixture.store.listEnabledSchedules.mockResolvedValue([hoursSchedule(fixture.scheduleId, 1, 1)]);
      fixture.store.findResourceCreatedAt.mockResolvedValue(createdAt(1));
      fixture.operatingAttribution.getDurationsForWindows
        .mockResolvedValueOnce(
          new Map([[`${fixture.scheduleId}:1`, { sessionDurationMs: 120 * 60_000, operatingDurationMs: 0 }]]),
        )
        .mockResolvedValueOnce(
          new Map([[`${fixture.scheduleId}:1`, { sessionDurationMs: 0, operatingDurationMs: 0 }]]),
        );
      const completedAt = new Date();
      fixture.view.baselineDate.mockResolvedValue(completedAt);

      await fixture.service.evaluateAll();

      expect(fixture.operatingAttribution.getDurationsForWindows).toHaveBeenNthCalledWith(
        2,
        [{ key: `${fixture.scheduleId}:1`, resourceId: 1, start: completedAt }],
        expect.any(Date),
        fixture.view.context,
      );
      expect(created()).not.toHaveBeenCalled();
    });

    it('should not create maintenance when USAGE_HOURS threshold not met in bulk data', async () => {
      fixture.store.listEnabledSchedules.mockResolvedValue([hoursSchedule(fixture.scheduleId, 1, 10)]);
      fixture.store.findResourceCreatedAt.mockResolvedValue(createdAt(1));
      // 100 minutes < 600 minutes threshold
      fixture.operatingAttribution.getDurationsForWindows.mockResolvedValue(
        new Map([[`${fixture.scheduleId}:1`, { sessionDurationMs: 100 * 60_000, operatingDurationMs: 0 }]]),
      );

      await fixture.service.evaluateAll();

      expect(created()).not.toHaveBeenCalled();
    });

    it('should evaluate USAGE_COUNT using bulk-fetched usage data', async () => {
      fixture.store.listEnabledSchedules.mockResolvedValue([countSchedule(fixture.scheduleId, 1, 5)]);
      fixture.store.findResourceCreatedAt.mockResolvedValue(createdAt(1));
      // The store counts 7 completed sessions (>= 5 threshold) and is asked to count them.
      fixture.store.loadServiceCycleStates.mockResolvedValue([
        {
          resourceId: 1,
          scheduleId: fixture.scheduleId,
          baseline: OLD_CREATED_AT,
          hasActiveMaintenance: false,
          completedSessions: 7,
        },
      ]);

      await fixture.service.evaluateAll();

      expect(fixture.store.loadServiceCycleStates).toHaveBeenCalledWith(
        [{ resourceId: 1, scheduleId: fixture.scheduleId, createdAt: OLD_CREATED_AT, countSessions: true }],
        expect.any(Date),
      );
      expect(created()).toHaveBeenCalledWith(1, fixture.scheduleId, expect.any(String), expect.anything(), false);
      expect(JSON.parse(created().mock.calls[0][2]).i18nKey).toBe('reason.auto.usageCount');
    });

    it('should not create maintenance when USAGE_COUNT threshold not met in bulk data', async () => {
      fixture.store.listEnabledSchedules.mockResolvedValue([countSchedule(fixture.scheduleId, 1, 10)]);
      fixture.store.findResourceCreatedAt.mockResolvedValue(createdAt(1));
      fixture.store.loadServiceCycleStates.mockResolvedValue([
        {
          resourceId: 1,
          scheduleId: fixture.scheduleId,
          baseline: OLD_CREATED_AT,
          hasActiveMaintenance: false,
          completedSessions: 3,
        },
      ]);

      await fixture.service.evaluateAll();

      expect(created()).not.toHaveBeenCalled();
    });

    it('should evaluate each usage-based schedule against its own baseline, not a shared one', async () => {
      const otherScheduleId = fixture.scheduleId + 1;
      const resourceCreatedAt = new Date('2024-01-01T00:00:00.000Z');
      const recentlyServiced = new Date('2026-06-01T00:00:00.000Z');

      fixture.store.listEnabledSchedules.mockResolvedValue([
        // Never serviced -> baseline is resource createdAt, plenty of usage accumulated
        hoursSchedule(fixture.scheduleId, 1, 10),
        // Serviced recently -> its own baseline, only a little usage since
        hoursSchedule(otherScheduleId, 1, 10),
      ]);
      fixture.store.findResourceCreatedAt.mockResolvedValue(new Map([[1, resourceCreatedAt]]));
      fixture.operatingAttribution.getDurationsForWindows.mockResolvedValue(
        new Map([
          [`${fixture.scheduleId}:1`, { sessionDurationMs: 900 * 60_000, operatingDurationMs: 0 }],
          [`${otherScheduleId}:1`, { sessionDurationMs: 30 * 60_000, operatingDurationMs: 0 }],
        ]),
      );
      // Same resource, different service-cycle baselines.
      fixture.store.loadServiceCycleStates.mockResolvedValue([
        {
          resourceId: 1,
          scheduleId: fixture.scheduleId,
          baseline: resourceCreatedAt,
          hasActiveMaintenance: false,
          completedSessions: 0,
        },
        {
          resourceId: 1,
          scheduleId: otherScheduleId,
          baseline: recentlyServiced,
          hasActiveMaintenance: false,
          completedSessions: 0,
        },
      ]);

      await fixture.service.evaluateAll();

      // Resolve all service-cycle baselines together, then derive exact durations per window.
      expect(fixture.store.loadServiceCycleStates).toHaveBeenCalledTimes(1);
      // Both schedules are asked for with their resource-created fallback baseline.
      expect(fixture.store.loadServiceCycleStates).toHaveBeenCalledWith(
        [
          { resourceId: 1, scheduleId: fixture.scheduleId, createdAt: resourceCreatedAt, countSessions: false },
          { resourceId: 1, scheduleId: otherScheduleId, createdAt: resourceCreatedAt, countSessions: false },
        ],
        expect.any(Date),
      );
      expect(fixture.operatingAttribution.getDurationsForWindows).toHaveBeenNthCalledWith(
        1,
        [
          { key: `${fixture.scheduleId}:1`, resourceId: 1, start: resourceCreatedAt },
          { key: `${otherScheduleId}:1`, resourceId: 1, start: recentlyServiced },
        ],
        expect.any(Date),
      );

      // Only the never-serviced schedule crossed its threshold
      expect(created()).toHaveBeenCalledTimes(1);
      expect(created()).toHaveBeenCalledWith(1, fixture.scheduleId, expect.any(String), expect.anything(), false);
    });

    it('should continue creating scheduled maintenances when one creation fails', async () => {
      fixture.store.listEnabledSchedules.mockResolvedValue([
        dueInterval(fixture.scheduleId, 1, 1),
        dueInterval(fixture.scheduleId + 1, 2, 1),
      ]);
      fixture.store.findResourceCreatedAt.mockResolvedValue(createdAt(1, 2));
      jest
        .spyOn(fixture.maintenanceService, 'createMaintenanceFromSchedule')
        .mockRejectedValueOnce(new Error('resource vanished mid-run'));

      await expect(fixture.service.evaluateAll()).resolves.toBeUndefined();

      expect(fixture.store.inTransaction).toHaveBeenCalledTimes(1);
      expect(fixture.view.atomically).toHaveBeenCalledTimes(2);
      expect(created()).toHaveBeenCalledTimes(2);
      expect(fixture.maintenanceService.emitScheduledMaintenanceCreated).toHaveBeenCalledTimes(1);
      expect(fixture.maintenanceService.emitScheduledMaintenanceCreated).toHaveBeenCalledWith(2, 1);
    });

    it('should not emit side effects when the write transaction fails to commit', async () => {
      fixture.store.listEnabledSchedules.mockResolvedValue([dueInterval(fixture.scheduleId, 1, 1)]);
      fixture.store.findResourceCreatedAt.mockResolvedValue(createdAt(1));
      fixture.store.inTransaction.mockImplementation(async (work) => {
        await work(fixture.view);
        throw new Error('transaction commit failed');
      });

      await expect(fixture.service.evaluateAll()).resolves.toBeUndefined();

      expect(created()).toHaveBeenCalledTimes(1);
      expect(fixture.maintenanceService.emitScheduledMaintenanceCreated).not.toHaveBeenCalled();
    });

    it('should do nothing when no enabled schedules exist', async () => {
      fixture.store.listEnabledSchedules.mockResolvedValue([]);

      await fixture.service.evaluateAll();

      expect(created()).not.toHaveBeenCalled();
      expect(fixture.store.findResourceCreatedAt).not.toHaveBeenCalled();
    });

    it('should use last-done maintenance endTime as baseline, not resource createdAt', async () => {
      // Last maintenance done 2 days ago — not yet 30 days, so should NOT trigger
      const lastDoneEndTime = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      fixture.store.listEnabledSchedules.mockResolvedValue([dueInterval(fixture.scheduleId, 1)]);
      fixture.store.findResourceCreatedAt.mockResolvedValue(createdAt(1));
      fixture.store.loadServiceCycleStates.mockResolvedValue([
        {
          resourceId: 1,
          scheduleId: fixture.scheduleId,
          baseline: lastDoneEndTime,
          hasActiveMaintenance: false,
          completedSessions: 0,
        },
      ]);

      await fixture.service.evaluateAll();

      // Should NOT trigger because only 2 days elapsed since last done (< 30 day threshold)
      expect(created()).not.toHaveBeenCalled();
    });

    it('should not run concurrent evaluations when lock is held', async () => {
      // Use a pending Promise so the first call holds the lock across microtask boundaries,
      // ensuring the second call observes the lock before the first finishes.
      let resolveList!: (val: never[]) => void;
      fixture.store.listEnabledSchedules.mockReturnValue(
        new Promise<never[]>((res) => {
          resolveList = res;
        }),
      );

      const firstCall = fixture.service.evaluateAll();
      // Second call fires while firstCall is still awaiting the schedule list
      const secondCall = fixture.service.evaluateAll();

      resolveList([]);
      await Promise.all([firstCall, secondCall]);

      // listed once: second call skipped due to lock held by first
      expect(fixture.store.listEnabledSchedules).toHaveBeenCalledTimes(1);
    });
  });
});
