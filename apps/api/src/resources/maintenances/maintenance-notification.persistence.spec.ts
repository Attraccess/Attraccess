import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource, EntityManager } from 'typeorm';
import { MaintenanceScheduleEvaluatorService } from './maintenance-schedule-evaluator.service';

describe('Scheduled maintenance commit notification', () => {
  let directory: string;
  let writer: DataSource;
  let observer: DataSource;
  let service: MaintenanceScheduleEvaluatorService;
  let rollback: boolean;
  let reads: Promise<{ count: number }[]>[];

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'maintenance-commit-'));
    const options = { type: 'sqlite' as const, database: join(directory, 'test.sqlite') };
    writer = await new DataSource(options).initialize();
    observer = await new DataSource(options).initialize();
    await writer.query('CREATE TABLE maintenance (id INTEGER PRIMARY KEY, resourceId INTEGER)');
    reads = [];
    rollback = false;
    const publish = () => {
      reads.push(observer.query('SELECT COUNT(*) AS count FROM maintenance'));
    };
    const manager = {
      transaction: (work: (em: EntityManager) => Promise<void>) =>
        writer.transaction(async (em) => {
          // Only schedule discovery is a fixture; writes and commit boundaries use real SQLite.
          jest.spyOn(em, 'getRepository').mockReturnValue({
            find: async () => [{ id: 1, triggerType: 'TIME_INTERVAL', timeIntervalConfig: { duration: 1 } }],
          } as never);
          await work(em);
          if (rollback) throw new Error('Commit rejected');
        }),
    };
    const maintenance = {
      hasActiveMaintenance: async () => false,
      createMaintenanceFromSchedule: async (
        resourceId: number,
        _scheduleId: number,
        _reason: string,
        em: EntityManager,
        notify = true,
      ) => {
        await em.query('INSERT INTO maintenance (id, resourceId) VALUES (1, ?)', [resourceId]);
        if (notify) {
          publish();
          await reads[reads.length - 1];
        }
        return { id: 1 };
      },
      emitScheduledMaintenanceCreated: publish,
    };
    service = new MaintenanceScheduleEvaluatorService(
      { manager } as never,
      {} as never,
      {} as never,
      {} as never,
      maintenance as never,
      {} as never,
      {} as never,
      {} as never,
    );
    jest
      .spyOn(service as unknown as { shouldTrigger: () => Promise<boolean> }, 'shouldTrigger')
      .mockResolvedValue(true);
  });

  afterEach(async () => {
    await observer.destroy();
    await writer.destroy();
    await rm(directory, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('publishes only when another database connection can read the committed maintenance', async () => {
    await service.evaluateResource(9);
    expect(await Promise.all(reads)).toEqual([[{ count: 1 }]]);
    expect(await observer.query('SELECT resourceId FROM maintenance')).toEqual([{ resourceId: 9 }]);
  });

  it('does not announce maintenance when the transaction rolls back', async () => {
    rollback = true;
    await expect(service.evaluateResource(9)).rejects.toThrow('Commit rejected');
    expect(reads).toHaveLength(0);
    expect(await observer.query('SELECT COUNT(*) AS count FROM maintenance')).toEqual([{ count: 0 }]);
  });
});
