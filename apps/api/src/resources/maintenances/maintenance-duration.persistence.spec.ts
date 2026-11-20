import { closeTestDataSource, createTestDataSource } from '../../test-utils/test-database';
import { createOperatingTimelineStore } from '../../database/adapters/operating-intervals/typeorm-operating-timeline.store';
import type { DataSource } from 'typeorm';
import {
  Resource,
  ResourceOperatingInterval,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
  ResourceMaintenanceSchedule,
} from '@attraccess/database-entities';
import {
  ResourceType,
  ResourceUsageAction,
  ResourceMaintenanceScheduleDurationBasis,
  ResourceMaintenanceScheduleTriggerType,
  UsageDurationUnit,
} from '@attraccess/application-models';
import { MaintenanceScheduleEvaluatorService } from './maintenance-schedule-evaluator.service';
import { ResourceOperatingAttributionService } from '../operating-intervals/resource-operating-attribution.service';
import {
  TypeOrmMaintenanceEvaluationStore,
  TypeOrmMaintenanceEvaluationView,
} from '../../database/adapters/resources/maintenance-evaluation-store.adapter';
import { unitOfWorkFor } from '../../database/adapters/shared-unit-of-work';

describe('Maintenance duration from authoritative intervals', () => {
  let dataSource: DataSource;
  let evaluator: MaintenanceScheduleEvaluatorService;
  let attribution: ResourceOperatingAttributionService;
  const baseline = new Date('2026-09-01T10:00:00.000Z');
  const now = new Date('2026-09-01T11:00:00.000Z');
  const schedule = (durationBasis: ResourceMaintenanceScheduleDurationBasis, minutes = 60) =>
    Object.assign(new ResourceMaintenanceSchedule(), {
      id: 1,
      resourceId: 1,
      triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_HOURS,
      durationBasis,
      usageHoursConfig: { duration: minutes, unit: UsageDurationUnit.MINUTES },
    });

  beforeEach(async () => {
    dataSource = await createTestDataSource();
    await dataSource.getRepository(Resource).save({ name: 'Laser', type: ResourceType.Machine });
    attribution = new ResourceOperatingAttributionService(createOperatingTimelineStore(dataSource));
    evaluator = new MaintenanceScheduleEvaluatorService(
      new TypeOrmMaintenanceEvaluationStore(dataSource, unitOfWorkFor(dataSource)),
      {} as never,
      {} as never,
      {} as never,
      attribution,
    );
    jest.spyOn(TypeOrmMaintenanceEvaluationView.prototype, 'baselineDate').mockResolvedValue(baseline);
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }).setSystemTime(now);
  });

  afterEach(async () => {
    jest.useRealTimers();
    await closeTestDataSource(dataSource);
  });

  it('counts live unattributed operating time and clips operation at the service baseline', async () => {
    await dataSource.getRepository(ResourceOperatingInterval).save({
      resourceId: 1,
      startTime: new Date('2026-09-01T09:00:00.000Z'),
      endTime: null,
    });

    const operating = ResourceMaintenanceScheduleDurationBasis.ATTRIBUTABLE_OPERATING_DURATION;
    await expect(evaluator.shouldTrigger(schedule(operating), 1)).resolves.toBe(true);
    await expect(evaluator.shouldTrigger(schedule(operating, 61), 1)).resolves.toBe(false);
  });

  it('counts an open usage session up to now without rounding a millisecond up', async () => {
    await dataSource.getRepository(ResourceUsage).save({
      resourceId: 1,
      usageAction: ResourceUsageAction.Usage,
      startTime: new Date(baseline.getTime() + 1),
      endTime: null,
      isFinalized: true,
    });
    const session = schedule(ResourceMaintenanceScheduleDurationBasis.SESSION_DURATION);

    await expect(evaluator.shouldTrigger(session, 1)).resolves.toBe(false);
    jest.setSystemTime(new Date(now.getTime() + 1));
    await expect(evaluator.shouldTrigger(session, 1)).resolves.toBe(true);
  });

  it('excludes pre-baseline session duration and sessions ending exactly at the baseline', async () => {
    await dataSource.getRepository(ResourceUsage).save([
      {
        resourceId: 1,
        usageAction: ResourceUsageAction.Usage,
        startTime: new Date('2026-09-01T08:00:00.000Z'),
        endTime: baseline,
      },
      {
        resourceId: 1,
        usageAction: ResourceUsageAction.Usage,
        startTime: new Date('2026-09-01T09:00:00.000Z'),
        endTime: now,
      },
    ]);

    const session = ResourceMaintenanceScheduleDurationBasis.SESSION_DURATION;
    await expect(evaluator.shouldTrigger(schedule(session, 61), 1)).resolves.toBe(false);
    await expect(evaluator.shouldTrigger(schedule(session, 60), 1)).resolves.toBe(true);
  });

  it('does not synthesize operating time from historical session snapshots', async () => {
    await dataSource.getRepository(ResourceUsage).save({
      resourceId: 1,
      usageAction: ResourceUsageAction.Usage,
      startTime: baseline,
      endTime: now,
      attributedOperatingDurationInMinutes: 60,
    });
    await expect(
      evaluator.shouldTrigger(schedule(ResourceMaintenanceScheduleDurationBasis.ATTRIBUTABLE_OPERATING_DURATION), 1),
    ).resolves.toBe(false);
  });
  it('excludes pending sessions while retaining independent machine operation', async () => {
    await dataSource.getRepository(ResourceUsage).save({
      resourceId: 1,
      usageAction: ResourceUsageAction.Usage,
      startTime: baseline,
      endTime: null,
      lifecyclePending: true,
    });
    await dataSource.getRepository(ResourceOperatingInterval).save({
      resourceId: 1,
      startTime: baseline,
      endTime: null,
    });
    await expect(
      evaluator.shouldTrigger(schedule(ResourceMaintenanceScheduleDurationBasis.SESSION_DURATION), 1),
    ).resolves.toBe(false);
    await expect(
      evaluator.shouldTrigger(schedule(ResourceMaintenanceScheduleDurationBasis.ATTRIBUTABLE_OPERATING_DURATION), 1),
    ).resolves.toBe(true);
  });
  it.each(['end', 'takeover'] as const)(
    'caps a pending %s at the request boundary and resumes on abort',
    async (kind) => {
      const usage = await dataSource.getRepository(ResourceUsage).save({
        resourceId: 1,
        usageAction: ResourceUsageAction.Usage,
        startTime: baseline,
        endTime: null,
        isFinalized: true,
      });
      await dataSource.getRepository(ResourceOperatingInterval).save({
        resourceId: 1,
        startTime: baseline,
        endTime: null,
      });
      await dataSource.getRepository(ResourceUsageLifecycleAttempt).save({
        id: 'attempt',
        resourceId: 1,
        kind,
        previousUsageId: usage.id,
        transitionTime: new Date('2026-09-01T10:30:00.000Z'),
        formSubmissions: [],
        billingItems: [],
      });

      const session = schedule(ResourceMaintenanceScheduleDurationBasis.SESSION_DURATION);
      await expect(evaluator.shouldTrigger(session, 1)).resolves.toBe(false);
      await expect(attribution.getForResource(1, now, baseline)).resolves.toMatchObject({
        sessionDurationMs: 30 * 60_000,
        operatingDurationMs: 60 * 60_000,
        attributedOperatingDurationMs: 30 * 60_000,
        isProvisional: true,
      });
      const batched = await attribution.getForResources([1], baseline, now);
      expect(batched.get(1)).toMatchObject({ sessionDurationMs: 30 * 60_000, isProvisional: true });

      await dataSource.getRepository(ResourceUsageLifecycleAttempt).delete('attempt');

      await expect(evaluator.shouldTrigger(session, 1)).resolves.toBe(true);
      await expect(attribution.getForResource(1, now, baseline)).resolves.toMatchObject({
        sessionDurationMs: 60 * 60_000,
        operatingDurationMs: 60 * 60_000,
        attributedOperatingDurationMs: 60 * 60_000,
        isProvisional: true,
      });
    },
  );
});
