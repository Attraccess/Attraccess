import type { DataSource } from 'typeorm';
import { Resource, ResourceMaintenance, ResourceMaintenanceSchedule } from '@attraccess/database-entities';
import {
  ResourceMaintenanceScheduleTriggerType,
  ResourceType,
  UsageDurationUnit,
} from '@attraccess/application-models';
import { MaintenanceScheduleEvaluatorService } from './maintenance-schedule-evaluator.service';
import {
  TypeOrmMaintenanceEvaluationStore,
  TypeOrmMaintenanceEvaluationView,
} from '../../database/adapters/resources/maintenance-evaluation-store.adapter';
import { TypeOrmResourceMaintenanceStore } from '../../database/adapters/resources/maintenance-store.adapter';
import { unitOfWorkFor } from '../../database/adapters/shared-unit-of-work';
import { engineTransactionOf } from '../../database/adapters/common/legacy-engine-transaction';
import { closeTestDataSource, createTestDataSource } from '../../test-utils/test-database';
import type { TransactionScope } from '../../database/unit-of-work';
import { MaintenanceResourceEvaluation } from './evaluation/resource-evaluation';

describe('Maintenance transaction coordination (PostgreSQL)', () => {
  let source: DataSource;
  let evaluator: MaintenanceScheduleEvaluatorService;
  let enabled: boolean;
  let failCreation: boolean;
  let notifications: number[];
  let scheduleId: number;

  const schedule = () => ({
    id: scheduleId,
    resourceId: 1,
    enabled: true,
    triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
    timeIntervalConfig: { duration: 1, unit: UsageDurationUnit.DAYS },
  });
  const maintenances = () => source.getRepository(ResourceMaintenance).find({ order: { id: 'ASC' } });

  beforeEach(async () => {
    source = await createTestDataSource();
    await source.getRepository(Resource).save({ name: 'Laser', type: ResourceType.Machine });
    scheduleId = (
      await source.getRepository(ResourceMaintenanceSchedule).save({
        resourceId: 1,
        name: 'Belt',
        triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
        enabled: true,
      })
    ).id;
    enabled = true;
    failCreation = false;
    notifications = [];

    // The evaluator, the evaluation store and the maintenance store are real; only the schedule configuration and
    // the business service around the maintenance store are fixtures. All writes go to PostgreSQL.
    const store = new TypeOrmMaintenanceEvaluationStore(source, unitOfWorkFor(source));
    const maintenanceStore = new TypeOrmResourceMaintenanceStore(source, unitOfWorkFor(source));
    jest.spyOn(store, 'hasEnabledSchedules').mockImplementation(async () => enabled);
    jest.spyOn(store, 'listEnabledSchedules').mockImplementation(async () => (enabled ? [schedule()] : []) as never);
    jest
      .spyOn(TypeOrmMaintenanceEvaluationView.prototype, 'enabledSchedules')
      .mockImplementation(async () => (enabled ? [schedule()] : []) as never);
    jest.spyOn(store, 'findResourceCreatedAt').mockResolvedValue(new Map([[1, new Date('2020-01-01')]]));
    jest.spyOn(store, 'loadServiceCycleStates').mockResolvedValue([
      {
        resourceId: 1,
        scheduleId,
        baseline: new Date('2020-01-01'),
        hasActiveMaintenance: false,
        completedSessions: 0,
      },
    ]);
    const handle = (context: TransactionScope) =>
      engineTransactionOf(context) ?? unitOfWorkFor(source).handleOf(context);
    evaluator = new MaintenanceScheduleEvaluatorService(
      store,
      {
        hasActiveMaintenance: (resourceId: number, context: TransactionScope) =>
          maintenanceStore.hasActive({ resourceId }, new Date(), context),
        createMaintenanceFromSchedule: async (
          resourceId: number,
          id: number,
          reason: string,
          context: TransactionScope,
          notify: boolean,
        ) => {
          expect(notify).toBe(false);
          const created = await handle(context)
            .getRepository(ResourceMaintenance)
            .save({ resourceId, maintenanceSchedule: { id }, startTime: new Date(), endTime: null, reason });
          if (failCreation) throw new Error('Maintenance creation failed');
          return { id: created.id };
        },
        emitScheduledMaintenanceCreated: (_resourceId: number, maintenanceId: number) => {
          notifications.push(maintenanceId);
        },
      } as never,
      {} as never,
      { maintenanceUsageQueryWindowDays: { observe: jest.fn() } } as never,
      { getDurationsForWindows: async () => new Map() } as never,
    );
    jest
      .spyOn(Reflect.get(evaluator, 'evaluation') as MaintenanceResourceEvaluation, 'shouldTrigger')
      .mockResolvedValue(true);
    jest.spyOn(TypeOrmMaintenanceEvaluationView.prototype, 'baselineDate').mockResolvedValue(new Date('2020-01-01'));
  });

  afterEach(async () => {
    await evaluator?.onModuleDestroy();
    await closeTestDataSource(source);
    jest.restoreAllMocks();
  });

  it.each(['resource', 'cron'] as const)(
    'creates the maintenance of a %s evaluation once and notifies after commit',
    async (path) => {
      if (path === 'resource') await evaluator.evaluateResource(1);
      else await evaluator.evaluateAll();

      const rows = await maintenances();
      expect(rows).toHaveLength(1);
      expect(notifications).toEqual([rows[0].id]);
    },
  );

  it('creates one maintenance when resource and cron evaluations run in parallel (per-resource lock)', async () => {
    const results = await Promise.allSettled([
      evaluator.evaluateResource(1),
      evaluator.evaluateResource(1),
      evaluator.evaluateResource(1),
      evaluator.evaluateAll(),
    ]);

    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    const rows = await maintenances();
    expect(rows).toHaveLength(1);
    expect(notifications).toEqual([rows[0].id]);
  });

  it.each(['resource', 'cron'] as const)(
    'rolls the maintenance back after a failed %s evaluation and recovers on the next one',
    async (path) => {
      failCreation = true;
      if (path === 'resource') {
        await expect(evaluator.evaluateResource(1)).rejects.toThrow('Maintenance creation failed');
      } else {
        // Cron logs individual failures and rolls back their savepoints.
        await evaluator.evaluateAll();
      }
      expect(await maintenances()).toEqual([]);
      expect(notifications).toHaveLength(0);

      failCreation = false;
      await evaluator.evaluateResource(1);

      const rows = await maintenances();
      expect(rows).toHaveLength(1);
      expect(notifications).toEqual([rows[0].id]);
    },
  );

  it('does nothing when no schedules are enabled', async () => {
    enabled = false;

    await evaluator.evaluateResource(1);
    await evaluator.evaluateAll();

    expect(await maintenances()).toEqual([]);
    expect(notifications).toHaveLength(0);
  });
});
