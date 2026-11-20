import { EntityManager, type DataSource } from 'typeorm';
import { MaintenanceScheduleEvaluatorService } from './maintenance-schedule-evaluator.service';
import { ResourceMaintenanceSchedule } from '@attraccess/database-entities';
import { MaintenanceResourceEvaluation } from './evaluation/resource-evaluation';
import { TypeOrmMaintenanceEvaluationStore } from '../../database/adapters/resources/maintenance-evaluation-store.adapter';
import { unitOfWorkFor } from '../../database/adapters/shared-unit-of-work';
import {
  closeTestDataSource,
  createTestDatabaseLocation,
  createTestDataSource,
  type TestDatabaseLocation,
} from '../../test-utils/test-database';

describe('Scheduled maintenance commit notification', () => {
  let database: TestDatabaseLocation;
  let writer: DataSource;
  let observer: DataSource;
  let service: MaintenanceScheduleEvaluatorService;
  let rollback: boolean;
  let reads: Promise<{ count: number }[]>[];
  let scheduleReads: jest.Mock;
  let enabled: boolean;

  beforeEach(async () => {
    database = await createTestDatabaseLocation();
    writer = await createTestDataSource({ location: database.location });
    observer = await createTestDataSource({ location: database.location });
    await writer.query('CREATE TABLE maintenance (id integer PRIMARY KEY, "resourceId" integer)');
    reads = [];
    rollback = false;
    enabled = true;
    scheduleReads = jest.fn(async (options) => {
      expect(options.where).toEqual({ resourceId: 9, enabled: true });
      // Executed by the repository owned by the live transaction, not the precheck repository.
      expect(writer.isInitialized).toBe(true);
      return enabled ? [{ id: 1, triggerType: 'TIME_INTERVAL', timeIntervalConfig: { duration: 1 } }] : [];
    });
    const publish = () => {
      reads.push(observer.query('SELECT COUNT(*) AS count FROM maintenance'));
    };
    // Only schedule discovery is a fixture; writes and commit boundaries use real PostgreSQL.
    const getRepository = EntityManager.prototype.getRepository;
    jest.spyOn(EntityManager.prototype, 'getRepository').mockImplementation(function (this: EntityManager, target) {
      if (target !== ResourceMaintenanceSchedule) return getRepository.call(this, target) as never;
      // Executed by the repository owned by the live transaction.
      expect(this.queryRunner?.isTransactionActive).toBe(true);
      return { find: scheduleReads } as never;
    });
    const store = new TypeOrmMaintenanceEvaluationStore(writer, unitOfWorkFor(writer));
    jest.spyOn(store, 'hasEnabledSchedules').mockResolvedValue(true);
    const inTransaction = store.inTransaction.bind(store);
    jest.spyOn(store, 'inTransaction').mockImplementation((work) =>
      inTransaction(async (view) => {
        const result = await work(view);
        if (rollback) throw new Error('Commit rejected');
        return result;
      }),
    );
    const handle = (context: object) =>
      context instanceof EntityManager ? context : unitOfWorkFor(writer).handleOf(context as never);
    const maintenance = {
      hasActiveMaintenance: async () => false,
      createMaintenanceFromSchedule: async (
        resourceId: number,
        _scheduleId: number,
        _reason: string,
        context: object,
        notify = true,
      ) => {
        await handle(context).query('INSERT INTO maintenance (id, "resourceId") VALUES (1, $1)', [resourceId]);
        if (notify) {
          publish();
          await reads[reads.length - 1];
        }
        return { id: 1 };
      },
      emitScheduledMaintenanceCreated: publish,
    };
    service = new MaintenanceScheduleEvaluatorService(
      store,
      maintenance as never,
      {} as never,
      {} as never,
      {} as never,
    );
    jest
      .spyOn(Reflect.get(service, 'evaluation') as MaintenanceResourceEvaluation, 'shouldTrigger')
      .mockResolvedValue(true);
  });

  afterEach(async () => {
    await closeTestDataSource(observer);
    await closeTestDataSource(writer);
    await database.remove();
    jest.restoreAllMocks();
  });

  it('publishes only when another database connection can read the committed maintenance', async () => {
    await service.evaluateResource(9);
    expect(scheduleReads).toHaveBeenCalledTimes(1);
    expect(await Promise.all(reads)).toEqual([[{ count: 1 }]]);
    expect(await observer.query('SELECT "resourceId" FROM maintenance')).toEqual([{ resourceId: 9 }]);
  });

  it('re-reads schedules inside the transaction even if the positive precheck becomes stale', async () => {
    // existsBy still returns true; the transactional repository sees the schedule disabled.
    enabled = false;
    await service.evaluateResource(9);
    expect(scheduleReads).toHaveBeenCalledTimes(1);
    expect(reads).toHaveLength(0);
    expect(await observer.query('SELECT COUNT(*) AS count FROM maintenance')).toEqual([{ count: 0 }]);
  });

  it('does not announce maintenance when the transaction rolls back', async () => {
    rollback = true;
    await expect(service.evaluateResource(9)).rejects.toThrow('Commit rejected');
    expect(reads).toHaveLength(0);
    expect(await observer.query('SELECT COUNT(*) AS count FROM maintenance')).toEqual([{ count: 0 }]);
  });
});
