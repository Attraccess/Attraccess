import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource, EntityManager } from 'typeorm';
import {
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleTriggerType,
  UsageDurationUnit,
} from '@attraccess/database-entities';
import { MaintenanceScheduleEvaluatorService } from './maintenance-schedule-evaluator.service';
import {
  closeResourceTransactionConnection,
  runSerializedTransaction,
} from '../../database/run-serialized-transaction';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('Maintenance transaction coordination (file-backed SQLite)', () => {
  let directory: string;
  let source: DataSource;
  let evaluator: MaintenanceScheduleEvaluatorService;
  let enabled: boolean;
  let failCreation: boolean;
  let notifications: Promise<unknown[]>[];
  let transactionsDuringUsage: number;
  let usageActive: boolean;

  const schedule = {
    id: 1,
    resourceId: 1,
    enabled: true,
    triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
    timeIntervalConfig: { duration: 1, unit: UsageDurationUnit.DAYS },
  };

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'maintenance-transactions-'));
    source = await new DataSource({ type: 'sqlite', database: join(directory, 'test.sqlite') }).initialize();
    await source.query('CREATE TABLE maintenance_probe (resourceId INTEGER PRIMARY KEY)');
    await source.query('CREATE TABLE usage_probe (id INTEGER PRIMARY KEY)');
    enabled = true;
    failCreation = false;
    notifications = [];
    transactionsDuringUsage = 0;
    usageActive = false;

    // Observe transaction entry before SQLite I/O so the overlap assertion does not
    // depend on how quickly the database happens to execute BEGIN TRANSACTION.
    const transaction = source.manager.transaction.bind(source.manager);
    jest.spyOn(source.manager, 'transaction').mockImplementation(async (isolationOrWork, work) => {
      if (usageActive) transactionsDuringUsage++;
      return typeof isolationOrWork === 'function' ? transaction(isolationOrWork) : transaction(isolationOrWork, work);
    });

    // The evaluator and transaction helper are real. Only schedule configuration
    // and maintenance business dependencies are fixtures; all writes use SQLite.
    const getRepository = EntityManager.prototype.getRepository;
    jest.spyOn(EntityManager.prototype, 'getRepository').mockImplementation(function (this: EntityManager, target) {
      if (target === ResourceMaintenanceSchedule) {
        return { find: async () => (enabled ? [schedule] : []) } as never;
      }
      return getRepository.call(this, target) as never;
    });
    evaluator = new MaintenanceScheduleEvaluatorService(
      {
        manager: source.manager,
        existsBy: async () => enabled,
        find: async () => (enabled ? [schedule] : []),
      } as never,
      { metadata: { tableName: 'maintenance_probe' } } as never,
      { find: async () => [{ id: 1, createdAt: new Date('2020-01-01') }] } as never,
      {
        query: async () => [{ resourceId: 1, scheduleId: 1, baseline: '2020-01-01 00:00:00.000' }],
      } as never,
      {
        hasActiveMaintenance: async (resourceId: number, manager: EntityManager) =>
          (await manager.query('SELECT * FROM maintenance_probe WHERE resourceId = ?', [resourceId])).length > 0,
        createMaintenanceFromSchedule: async (
          resourceId: number,
          _scheduleId: number,
          _reason: string,
          manager: EntityManager,
          notify: boolean,
        ) => {
          expect(notify).toBe(false);
          await manager.query('INSERT INTO maintenance_probe VALUES (?)', [resourceId]);
          if (failCreation) throw new Error('Maintenance creation failed');
          return { id: resourceId };
        },
        emitScheduledMaintenanceCreated: () => {
          // The main connection must see the committed write from the dedicated connection.
          notifications.push(source.query('SELECT * FROM maintenance_probe'));
        },
      } as never,
      {} as never,
      { maintenanceUsageQueryWindowDays: { observe: jest.fn() } } as never,
      { getDurationsForWindows: async () => new Map() } as never,
    );
    jest.spyOn(evaluator, 'shouldTrigger').mockResolvedValue(true);
  });

  afterEach(async () => {
    evaluator?.onModuleDestroy();
    await closeResourceTransactionConnection(source);
    await source.destroy();
    jest.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  it.each(['resource', 'cron'] as const)('queues %s evaluation behind an active usage transaction', async (path) => {
    const entered = deferred();
    const release = deferred();
    const usage = runSerializedTransaction(source.manager, async (manager) => {
      await manager.query('INSERT INTO usage_probe VALUES (1)');
      usageActive = true;
      entered.resolve();
      await release.promise;
      usageActive = false;
    });
    await entered.promise;
    // Attach a rejection handler immediately, including on the broken implementation.
    const evaluation = Promise.allSettled([
      path === 'resource' ? evaluator.evaluateResource(1) : evaluator.evaluateAll(),
    ]);
    try {
      // Fixture reads resolve in microtasks. Drain them before releasing usage;
      // an unqueued transaction entry is observed synchronously by the spy above.
      await new Promise<void>((resolve) => setImmediate(resolve));
    } finally {
      release.resolve();
      await usage;
    }
    const results = await evaluation;
    expect(transactionsDuringUsage).toBe(0);
    expect(results).toEqual([{ status: 'fulfilled', value: undefined }]);
    expect(await source.query('SELECT * FROM usage_probe')).toEqual([{ id: 1 }]);
    expect(await source.query('SELECT * FROM maintenance_probe')).toEqual([{ resourceId: 1 }]);
    expect(await Promise.all(notifications)).toEqual([[{ resourceId: 1 }]]);
  });

  it('serializes concurrent resource and cron evaluations without duplicate maintenance', async () => {
    const results = await Promise.allSettled([
      evaluator.evaluateResource(1),
      evaluator.evaluateResource(1),
      evaluator.evaluateAll(),
    ]);
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    expect(await source.query('SELECT * FROM maintenance_probe')).toEqual([{ resourceId: 1 }]);
    expect(await Promise.all(notifications)).toEqual([[{ resourceId: 1 }]]);
  });

  it.each(['resource', 'cron'] as const)(
    'recovers usage and maintenance writes after a failed %s evaluation',
    async (path) => {
      failCreation = true;
      if (path === 'resource') {
        await expect(evaluator.evaluateResource(1)).rejects.toThrow('Maintenance creation failed');
      } else {
        // Cron logs individual failures and rolls back their savepoints.
        await evaluator.evaluateAll();
      }
      expect(await source.query('SELECT * FROM maintenance_probe')).toEqual([]);
      expect(notifications).toHaveLength(0);
      await runSerializedTransaction(source.manager, (manager) => manager.query('INSERT INTO usage_probe VALUES (2)'));
      failCreation = false;
      await evaluator.evaluateResource(1);
      expect(await source.query('SELECT * FROM usage_probe')).toEqual([{ id: 2 }]);
      expect(await Promise.all(notifications)).toEqual([[{ resourceId: 1 }]]);
    },
  );

  it('skips the transaction queue when no schedules are enabled', async () => {
    enabled = false;
    // A blocked usage transaction must not delay this no-op evaluation.
    const entered = deferred();
    const release = deferred();
    const usage = runSerializedTransaction(source.manager, async () => {
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    let completed = false;
    const evaluation = evaluator.evaluateResource(1).then(() => {
      completed = true;
    });
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(completed).toBe(true);
      expect(source.manager.transaction).not.toHaveBeenCalled();
      expect(notifications).toHaveLength(0);
    } finally {
      release.resolve();
      await Promise.all([usage, evaluation]);
    }
  });
});
