import { DataSource } from 'typeorm';
import { DatabaseTransactions, operationToken, TransactionScope } from '../../../database/transaction-scope';
import { ResourceMaintenanceSchedule, ResourceMaintenanceScheduleTriggerType } from '@attraccess/application-models';
import { MaintenanceScheduleEvaluatorService } from '../maintenance-schedule-evaluator.service';
import { MAINTENANCE_EVALUATION_OPERATIONS } from './port';
import { TypeormMaintenanceEvaluationPersistence } from './typeorm-adapter';

class BatchEvaluator extends MaintenanceScheduleEvaluatorService {
  persist(candidates: Array<{ resourceId: number; schedule: ResourceMaintenanceSchedule }>) {
    return this.persistTriggeredSchedules(candidates);
  }
}

describe('Maintenance batch boundary failures', () => {
  it.each([false, true])('rolls back the entire batch when release fails (already released: %s)', async (released) => {
    const database = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
    try {
      await database.query('CREATE TABLE maintenance (id INTEGER PRIMARY KEY)');
      const insert = operationToken<{ create(id: number): Promise<void> }>('test maintenance insert', ['create']);
      const transactions = new DatabaseTransactions({
        backend: 'sqlite',
        run: (_conflicts, work) =>
          database.transaction(async (manager) => {
            const query = manager.query.bind(manager);
            let releaseFailed = false;
            jest.spyOn(manager, 'query').mockImplementation(async (sql, parameters) => {
              if (sql === 'RELEASE SAVEPOINT maintenance_schedule_2' && !releaseFailed) {
                releaseFailed = true;
                if (released) await query(sql, parameters);
                throw new Error('Release failed');
              }
              return query(sql, parameters);
            });
            return work({
              resolve: (token) => {
                if (token.id === MAINTENANCE_EVALUATION_OPERATIONS.id)
                  return new TypeormMaintenanceEvaluationPersistence(manager) as never;
                if (token.id === insert.id)
                  return {
                    create: async (id: number) => {
                      await query('INSERT INTO maintenance VALUES (?)', [id]);
                    },
                  } as never;
                throw new Error('Unknown operation');
              },
            });
          }),
      });
      const maintenance = {
        hasActiveMaintenance: jest.fn().mockResolvedValue(false),
        createMaintenanceFromSchedule: jest.fn(
          async (resourceId: number, _scheduleId: number, _reason: string, scope: TransactionScope) => {
            await scope.resolve(insert).create(resourceId);
            return { id: resourceId };
          },
        ),
        emitScheduledMaintenanceCreated: jest.fn(),
      };
      const evaluator = new BatchEvaluator(
        {} as never,
        transactions,
        maintenance as never,
        {} as never,
        {} as never,
        {} as never,
      );
      await evaluator.persist(
        [1, 2, 3].map((resourceId) => ({
          resourceId,
          schedule: {
            id: resourceId,
            triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
            timeIntervalConfig: { duration: 1 },
          } as ResourceMaintenanceSchedule,
        })),
      );
      expect(maintenance.createMaintenanceFromSchedule).toHaveBeenCalledTimes(2);
      expect(maintenance.emitScheduledMaintenanceCreated).not.toHaveBeenCalled();
      expect(await database.query('SELECT * FROM maintenance')).toEqual([]);
    } finally {
      await database.destroy();
      jest.restoreAllMocks();
    }
  });
});
