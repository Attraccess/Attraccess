import type { DataSource, EntityManager } from 'typeorm';
import { PluginStorageInvalid, type PluginTransactionScope } from '@attraccess/plugins-backend-sdk';
import { handleOfScope } from '../../../plugin-system/persistence/plugin-transaction-scope';
import type {
  PluginStorageExecutor,
  PluginStorageSessions,
  PluginStorageWriteResult,
} from '../../../plugin-system/plugin-storage/storage-dialect.port';

const SAVEPOINT = 'plugin_storage_write';

/**
 * Runs statements on a TypeORM entity manager (a transaction's manager, or the shared connection for reads). TypeORM
 * is only the carrier: statements are raw SQL with bound parameters built by the storage layer.
 */
export class PostgresManagerExecutor implements PluginStorageExecutor {
  /**
   * `savepoints`: each write of a transaction the plugin keeps running (a scope) is wrapped in a savepoint. A failed
   * statement (a unique violation the plugin catches) aborts a PostgreSQL transaction; the savepoint undoes just that
   * statement, so the transaction goes on as the neutral contract promises.
   */
  constructor(
    private readonly manager: EntityManager,
    private readonly savepoints = false,
  ) {}

  query(sql: string, params: readonly unknown[]): Promise<Record<string, unknown>[]> {
    return this.manager.query(sql, [...params]);
  }

  async execute(sql: string, params: readonly unknown[]): Promise<PluginStorageWriteResult> {
    const result = await this.write(sql, params);
    return { affected: result.affected ?? 0 };
  }

  async insert(sql: string, params: readonly unknown[], generatedKey: string | undefined): Promise<unknown> {
    const result = await this.write(sql, params);
    // The statement carries `RETURNING "<key>"` (the dialect's `returning`): the engine's generated key.
    return generatedKey === undefined ? undefined : result.records?.[0]?.[generatedKey];
  }

  private async write(
    sql: string,
    params: readonly unknown[],
  ): Promise<{ affected?: number; records?: Array<Record<string, unknown>> }> {
    const runner = this.manager.queryRunner;
    if (!runner) throw new Error('A write needs a transaction.');
    if (!this.savepoints) return runner.query(sql, [...params], true);
    await runner.query(`SAVEPOINT ${SAVEPOINT}`);
    try {
      const result = await runner.query(sql, [...params], true);
      await runner.query(`RELEASE SAVEPOINT ${SAVEPOINT}`);
      return result;
    } catch (error) {
      await runner.query(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`).catch(() => undefined);
      throw error;
    }
  }
}

/** Why a write without scope cannot run in the calling flow, or undefined when it can. */
const unscopedWriteRefusal = (isRunning: () => boolean): string | undefined =>
  isRunning()
    ? 'A write inside context.persistence.transaction needs the transaction scope: pass { scope } to the call.'
    : undefined;

/**
 * Sessions of plugin storage on PostgreSQL. A call with a scope joins that transaction. Without one, a read runs on
 * the pool at once and sees committed state. A write is a transaction of its own (one unit of work for the call) on
 * a pooled connection: transactions are not serialised per process, PostgreSQL isolates them. A write without scope
 * inside a plugin transaction callback is rejected: it would run beside that transaction and not in it.
 */
export function createPostgresSessions(connection: () => DataSource, isRunning: () => boolean): PluginStorageSessions {
  return {
    async run<T>(
      access: 'read' | 'write',
      scope: PluginTransactionScope | undefined,
      work: (executor: PluginStorageExecutor) => Promise<T>,
    ): Promise<T> {
      if (scope) return work(new PostgresManagerExecutor(handleOfScope<EntityManager>(scope, access), true));
      if (access === 'read') return work(new PostgresManagerExecutor(connection().manager));
      const refusal = unscopedWriteRefusal(isRunning);
      if (refusal) throw new PluginStorageInvalid(refusal);
      return connection().manager.transaction((manager) => work(new PostgresManagerExecutor(manager)));
    },
  };
}
