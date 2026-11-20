import type { DataSource, EntityManager } from 'typeorm';
import {
  Resource,
  ResourceMaintenance,
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleTimeIntervalConfig,
  ResourceUsage,
  User,
} from '@attraccess/database-entities';
import {
  ResourceMaintenanceScheduleTriggerType,
  ResourceType,
  ResourceUsageAction,
  UsageDurationUnit,
} from '@attraccess/application-models';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { unitOfWorkFor } from '../shared-unit-of-work';
import { TypeOrmMaintenanceEvaluationStore } from './maintenance-evaluation-store.adapter';
import { MAX_PAIRS_PER_QUERY } from './maintenance-evaluation-queries';

describe('maintenance evaluation store on real PostgreSQL', () => {
  let source: DataSource;
  let store: TypeOrmMaintenanceEvaluationStore;
  let resourceId: number;
  let userId: number;
  let scheduleId: number;
  const createdAt = new Date('2024-01-01T00:00:00.000Z');

  /** The transaction of a view: writes through it are part of the unit of work. */
  const transactionOf = (view: { context: object | undefined }): EntityManager =>
    unitOfWorkFor(source).handleOf(view.context as never);
  const addMaintenance = (
    endTime: Date | null,
    startTime = new Date('2025-01-01T00:00:00.000Z'),
    manager: EntityManager = source.manager,
  ) =>
    manager
      .getRepository(ResourceMaintenance)
      .save({ resourceId, maintenanceSchedule: { id: scheduleId }, startTime, endTime, reason: null });
  const addSession = (endTime: Date | null, lifecyclePending = false) =>
    source.getRepository(ResourceUsage).save({
      resourceId,
      userId,
      usageAction: ResourceUsageAction.Usage,
      startTime: new Date('2025-01-01T00:00:00.000Z'),
      endTime,
      lifecyclePending,
      isFinalized: !lifecyclePending,
    });

  beforeEach(async () => {
    source = await createTestDataSource();
    store = new TypeOrmMaintenanceEvaluationStore(source, unitOfWorkFor(source));
    const resource = await source
      .getRepository(Resource)
      .save(source.getRepository(Resource).create({ name: 'Laser', type: ResourceType.Machine }));
    resourceId = resource.id;
    await source.query('UPDATE resource SET "createdAt" = $1 WHERE id = $2', [createdAt, resourceId]);
    userId = (
      await source
        .getRepository(User)
        .save(source.getRepository(User).create({ username: 'alice', email: 'alice@example.test' }))
    ).id;
    const schedule = await source.getRepository(ResourceMaintenanceSchedule).save({
      resourceId,
      name: 'Belt',
      triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
      enabled: true,
    });
    scheduleId = schedule.id;
    await source
      .getRepository(ResourceMaintenanceScheduleTimeIntervalConfig)
      .save({ scheduleId, duration: 30, unit: UsageDurationUnit.DAYS });
  });

  afterEach(async () => {
    await closeTestDataSource(source);
  });

  describe('schedules', () => {
    it('lists the enabled schedules with their trigger configuration as neutral records', async () => {
      const [record] = await store.listEnabledSchedules();

      expect(record).toMatchObject({
        id: scheduleId,
        resourceId,
        name: 'Belt',
        enabled: true,
        triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
        timeIntervalConfig: { scheduleId, duration: 30, unit: UsageDurationUnit.DAYS },
      });
      expect(record.constructor).toBe(Object);
      expect(await store.hasEnabledSchedules(resourceId)).toBe(true);
      expect((await store.current().enabledSchedules(resourceId)).map((schedule) => schedule.id)).toEqual([scheduleId]);
    });

    it('ignores disabled schedules', async () => {
      await source.getRepository(ResourceMaintenanceSchedule).update(scheduleId, { enabled: false });

      expect(await store.listEnabledSchedules()).toEqual([]);
      expect(await store.hasEnabledSchedules(resourceId)).toBe(false);
      expect(await store.current().enabledSchedules(resourceId)).toEqual([]);
    });

    it('reports the creation time of the resources that exist', async () => {
      expect(await store.findResourceCreatedAt([resourceId, 999])).toEqual(new Map([[resourceId, createdAt]]));
    });
  });

  describe('baseline and session count', () => {
    it('starts the service cycle with the creation of the resource, then with the last completed maintenance', async () => {
      expect(await store.current().baselineDate(resourceId, scheduleId)).toEqual(createdAt);

      await addMaintenance(new Date('2025-02-01T00:00:00.000Z'));
      await addMaintenance(new Date('2025-03-01T12:00:00.000Z'));
      await addMaintenance(null, new Date('2025-04-01T00:00:00.000Z'));

      expect(await store.current().baselineDate(resourceId, scheduleId)).toEqual(new Date('2025-03-01T12:00:00.000Z'));
    });

    it('counts only completed sessions that ended since the baseline', async () => {
      await addSession(new Date('2025-01-02T00:00:00.000Z'));
      await addSession(new Date('2025-03-02T00:00:00.000Z'));
      await addSession(null);
      await addSession(new Date('2025-03-03T00:00:00.000Z'), true);

      const view = store.current();
      expect(await view.completedSessionCountSince(resourceId, new Date('2025-01-01T00:00:00.000Z'))).toBe(2);
      expect(await view.completedSessionCountSince(resourceId, new Date('2025-02-01T00:00:00.000Z'))).toBe(1);
    });
  });

  describe('service cycle states', () => {
    it('resolves baselines, running maintenance and completed sessions in one query per kind', async () => {
      await addMaintenance(new Date('2025-02-01T00:00:00.000Z'));
      await addSession(new Date('2025-01-02T00:00:00.000Z'));
      await addSession(new Date('2025-03-02T00:00:00.000Z'));
      const queries = jest.spyOn(source.manager, 'query');

      const states = await store.loadServiceCycleStates(
        [
          { resourceId, scheduleId, createdAt, countSessions: false },
          { resourceId, scheduleId: scheduleId + 1, createdAt, countSessions: true },
        ],
        new Date('2026-01-01T00:00:00.000Z'),
      );

      expect(queries).toHaveBeenCalledTimes(2);
      const byKey = new Map(states.map((state) => [state.scheduleId, state]));
      expect(byKey.get(scheduleId)).toEqual({
        resourceId,
        scheduleId,
        baseline: new Date('2025-02-01T00:00:00.000Z'),
        hasActiveMaintenance: false,
        completedSessions: 0,
      });
      // Never serviced: the baseline is the creation of the resource, and every completed session counts.
      expect(byKey.get(scheduleId + 1)).toEqual({
        resourceId,
        scheduleId: scheduleId + 1,
        baseline: createdAt,
        hasActiveMaintenance: false,
        completedSessions: 2,
      });
    });

    it('reports a maintenance that started and has not ended', async () => {
      await addMaintenance(null, new Date('2025-06-01T00:00:00.000Z'));

      const [state] = await store.loadServiceCycleStates(
        [{ resourceId, scheduleId, createdAt, countSessions: false }],
        new Date('2026-01-01T00:00:00.000Z'),
      );

      expect(state.hasActiveMaintenance).toBe(true);
    });

    it('splits the requests below the PostgreSQL bind limit', async () => {
      const queries = jest.spyOn(source.manager, 'query').mockResolvedValue([]);
      const requests = Array.from({ length: MAX_PAIRS_PER_QUERY + 1 }, (_, index) => ({
        resourceId: index + 1,
        scheduleId: index + 1,
        createdAt,
        countSessions: true,
      }));

      await store.loadServiceCycleStates(requests, new Date());

      expect(queries.mock.calls.map(([, params]) => (params as unknown[]).length)).toEqual([
        MAX_PAIRS_PER_QUERY * 3 + 1,
        4,
      ]);
    });
  });

  describe('snapshot and transaction', () => {
    it('reads the committed history and never the uncommitted writes of another transaction', async () => {
      expect(store.snapshotReads).toBe(false);
      await addSession(null);
      const committed = await store.inSnapshot((view) => view.durationFingerprint(resourceId));

      await expect(
        store.inTransaction(async (view) => {
          await transactionOf(view)
            .getRepository(ResourceUsage)
            .update({ resourceId }, { endTime: new Date('2025-01-01T00:00:30Z') });
          expect(await view.durationFingerprint(resourceId)).not.toBe(committed);
          expect(await store.inSnapshot((snapshot) => snapshot.durationFingerprint(resourceId))).toBe(committed);
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');

      expect(await store.inSnapshot((view) => view.durationFingerprint(resourceId))).toBe(committed);
      await store.close();
    });

    it('undoes only the work of a failed atomic step', async () => {
      await store.inTransaction(async (view) => {
        const manager = transactionOf(view);
        await view.atomically('first', () => addMaintenance(new Date('2025-02-01T00:00:00.000Z'), undefined, manager));
        await expect(
          view.atomically('second', async () => {
            await addMaintenance(new Date('2025-03-01T00:00:00.000Z'), undefined, manager);
            throw new Error('step failed');
          }),
        ).rejects.toThrow('step failed');
      });

      const rows = await source.getRepository(ResourceMaintenance).find();
      expect(rows.map((row) => row.endTime)).toEqual([new Date('2025-02-01T00:00:00.000Z')]);
    });

    it('commits the writes of a transaction together and rolls them back together', async () => {
      await store.inTransaction(async (view) => {
        await addMaintenance(new Date('2025-02-01T00:00:00.000Z'), undefined, transactionOf(view));
      });
      await expect(
        store.inTransaction(async (view) => {
          await addMaintenance(new Date('2025-03-01T00:00:00.000Z'), undefined, transactionOf(view));
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');

      expect(await source.getRepository(ResourceMaintenance).count()).toBe(1);
    });
  });
});
