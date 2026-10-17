import {
  DatabaseTransactions,
  TransactionScope,
  operationToken,
  TransactionOperations,
} from '../../database/transaction-scope';
import { MAINTENANCE_EVALUATION_OPERATIONS } from './persistence/port';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
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
    const insert = operationToken<{ create(resourceId: number): Promise<{ id: number }> }>(
      'fixture maintenance write',
      ['create'],
    );
    const transactions = new DatabaseTransactions({
      backend: 'sqlite',
      run: (_conflicts, work) =>
        writer.transaction(async (em) => {
          const result = await work({
            resolve: ((token) => {
              if (token.id === MAINTENANCE_EVALUATION_OPERATIONS.id)
                return {
                  enabledSchedules: async () => [
                    { id: 1, triggerType: 'TIME_INTERVAL', timeIntervalConfig: { duration: 1 } },
                  ],
                };
              if (token.id === insert.id)
                return {
                  create: async (resourceId: number) => {
                    await em.query('INSERT INTO maintenance (id, resourceId) VALUES (1, ?)', [resourceId]);
                    return { id: 1 };
                  },
                };
              throw new Error('Unknown fixture operation');
            }) as TransactionOperations['resolve'],
          });
          if (rollback) throw new Error('Commit rejected');
          return result;
        }),
    });
    const maintenance = {
      hasActiveMaintenance: async () => false,
      createMaintenanceFromSchedule: async (
        resourceId: number,
        _scheduleId: number,
        _reason: string,
        em: TransactionScope,
        notify = true,
      ) => {
        expect(Reflect.get(em, 'query')).toBeUndefined();
        await em.resolve(insert).create(resourceId);
        if (notify) {
          publish();
          await reads[reads.length - 1];
        }
        return { id: 1 };
      },
      emitScheduledMaintenanceCreated: publish,
    };
    service = new MaintenanceScheduleEvaluatorService(
      {} as never,
      transactions,
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
