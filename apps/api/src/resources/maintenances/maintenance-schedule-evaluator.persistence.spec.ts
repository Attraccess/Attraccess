import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ResourceMaintenanceSchedule, ResourceMaintenanceScheduleTriggerType, UsageDurationUnit } from '@attraccess/database-entities';
import { MaintenanceScheduleEvaluatorService } from './maintenance-schedule-evaluator.service';
import { ResourceMaintenanceService } from './maintenance.service';
import { closeResourceTransactionConnection, runSerializedTransaction } from '../../database/run-serialized-transaction';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};

describe('maintenance and usage transactions (file-backed SQLite)', () => {
  let directory: string;
  let source: DataSource;
  let evaluator: MaintenanceScheduleEvaluatorService;
  let maintenance: { hasActiveMaintenance: jest.Mock; createMaintenanceFromSchedule: jest.Mock; emitScheduledMaintenanceCreated: jest.Mock };

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'attraccess-maintenance-'));
    source = await new DataSource({ type: 'sqlite', database: join(directory, 'test.sqlite') }).initialize();
    await source.query('CREATE TABLE maintenance_probe (resourceId INTEGER PRIMARY KEY)');
    await source.query('CREATE TABLE usage_probe (id INTEGER PRIMARY KEY)');

    // Keep the database/transaction implementation real while isolating schedule
    // configuration and notification dependencies from the rest of the application.
    const getRepository = EntityManager.prototype.getRepository;
    jest.spyOn(EntityManager.prototype, 'getRepository').mockImplementation(function (this: EntityManager, target) {
      if (target === ResourceMaintenanceSchedule) {
        return {
          find: async ({ where }: { where: { resourceId: number } }) => [
            { id: 1, resourceId: where.resourceId, enabled: true },
          ],
        } as never;
      }
      return getRepository.call(this, target) as never;
    });
    maintenance = {
      hasActiveMaintenance: jest.fn(async (resourceId: number, manager: EntityManager) =>
        (await manager.query('SELECT resourceId FROM maintenance_probe WHERE resourceId = ?', [resourceId])).length > 0,
      ),
      createMaintenanceFromSchedule: jest.fn(async (resourceId: number, _schedule: number, _reason: string, manager: EntityManager) => {
        await manager.query('INSERT INTO maintenance_probe VALUES (?)', [resourceId]);
        return { id: resourceId };
      }),
      emitScheduledMaintenanceCreated: jest.fn(),
    };
    evaluator = new MaintenanceScheduleEvaluatorService(
      { manager: source.manager } as Repository<ResourceMaintenanceSchedule>,
      {} as never, {} as never, {} as never,
      maintenance as unknown as ResourceMaintenanceService,
      {} as never, {} as never, {} as never,
    );
    jest.spyOn(evaluator, 'shouldTrigger').mockResolvedValue(true);
  });

  afterEach(async () => {
    evaluator?.onModuleDestroy();
    if (source?.isInitialized) {
      await closeResourceTransactionConnection(source);
      await source.destroy();
    }
    jest.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  it('queues evaluations behind usage writes and rechecks active maintenance', async () => {
    const entered = deferred();
    const release = deferred();
    const usage = runSerializedTransaction(source.manager, async (manager) => {
      await manager.query('INSERT INTO usage_probe VALUES (1)');
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    const evaluations = [evaluator.evaluateResource(1), evaluator.evaluateResource(1), evaluator.evaluateResource(2)];
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(maintenance.hasActiveMaintenance).not.toHaveBeenCalled();
    } finally {
      release.resolve();
      await Promise.all([usage, ...evaluations]);
    }
    expect(await source.query('SELECT * FROM usage_probe')).toHaveLength(1);
    expect(await source.query('SELECT * FROM maintenance_probe')).toHaveLength(2);
    expect(maintenance.createMaintenanceFromSchedule).toHaveBeenCalledTimes(2);
    expect(maintenance.emitScheduledMaintenanceCreated).toHaveBeenCalledTimes(2);
  });

  it('queues cron maintenance writes behind usage transactions too', async () => {
    const schedule = {
      id: 1, resourceId: 1, enabled: true,
      triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
      timeIntervalConfig: { duration: 1, unit: UsageDurationUnit.DAYS },
    };
    const bulk = new MaintenanceScheduleEvaluatorService(
      { manager: source.manager, find: async () => [schedule] } as unknown as Repository<ResourceMaintenanceSchedule>,
      { metadata: { tableName: 'maintenance_probe' } } as never,
      { find: async () => [{ id: 1, createdAt: new Date('2020-01-01') }] } as never,
      {
        metadata: { tableName: 'usage_probe' },
        query: async () => [{ resourceId: 1, scheduleId: 1, baseline: '2020-01-01 00:00:00.000' }],
      } as never,
      maintenance as unknown as ResourceMaintenanceService,
      {} as never,
      { maintenanceUsageQueryWindowDays: { observe: jest.fn() } } as never,
      { getDurationsForWindows: async () => new Map() } as never,
    );
    const entered = deferred();
    const release = deferred();
    const usage = runSerializedTransaction(source.manager, async (manager) => {
      await manager.query('INSERT INTO usage_probe VALUES (1)');
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    const evaluation = bulk.evaluateAll();
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(maintenance.hasActiveMaintenance).not.toHaveBeenCalled();
    } finally {
      release.resolve();
      await Promise.all([usage, evaluation]);
      bulk.onModuleDestroy();
    }
    expect(await source.query('SELECT * FROM maintenance_probe')).toHaveLength(1);
    expect(maintenance.emitScheduledMaintenanceCreated).toHaveBeenCalledWith(1, 1);
  });

  it('rolls back failed maintenance and allows the next usage transaction to commit', async () => {
    maintenance.createMaintenanceFromSchedule.mockImplementationOnce(async (_id, _schedule, _reason, manager: EntityManager) => {
      await manager.query('INSERT INTO maintenance_probe VALUES (1)');
      throw new Error('maintenance failed');
    });
    await expect(evaluator.evaluateResource(1)).rejects.toThrow('maintenance failed');
    await runSerializedTransaction(source.manager, (manager) => manager.query('INSERT INTO usage_probe VALUES (2)'));
    expect(await source.query('SELECT * FROM maintenance_probe')).toHaveLength(0);
    expect(await source.query('SELECT * FROM usage_probe')).toHaveLength(1);
    expect(maintenance.emitScheduledMaintenanceCreated).not.toHaveBeenCalled();
  });

  it('notifies after commit, with the maintenance visible on another connection', async () => {
    let notificationRead: Promise<unknown[]> | undefined;
    maintenance.emitScheduledMaintenanceCreated.mockImplementation(() => {
      notificationRead = source.query('SELECT * FROM maintenance_probe');
    });
    await evaluator.evaluateResource(1);
    expect(maintenance.emitScheduledMaintenanceCreated).toHaveBeenCalledWith(1, 1);
    expect(await notificationRead).toHaveLength(1);
  });
});
