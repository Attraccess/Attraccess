import type { DataSource, EntityManager } from 'typeorm';
import { PluginStorageInvalid, type PluginTransactionScope } from '@attraccess/plugins-backend-sdk';
import { handleOfScope } from '../../../plugin-system/persistence/plugin-transaction-scope';
import type {
  PluginStorageExecutor,
  PluginStorageSessions,
  PluginStorageWriteResult,
} from '../../../plugin-system/plugin-storage/storage-dialect.port';
import { runSerializedTransaction } from '../run-serialized-transaction';

/**
 * Runs statements on a TypeORM entity manager (a transaction's manager, or the shared connection for reads). TypeORM
 * is only the carrier: statements are raw SQL with bound parameters built by the storage layer.
 */
export class ManagerExecutor implements PluginStorageExecutor {
  constructor(private readonly manager: EntityManager) {}

  query(sql: string, params: readonly unknown[]): Promise<Record<string, unknown>[]> {
    return this.manager.query(sql, [...params]);
  }

  async execute(sql: string, params: readonly unknown[]): Promise<PluginStorageWriteResult> {
    const runner = this.manager.queryRunner;
    if (!runner) throw new Error('A write needs a transaction.');
    // The statement text decides how the driver runs it (INSERT/UPDATE/DELETE report changes and the row id).
    const result = await runner.query(sql, [...params], true);
    return { affected: result.affected ?? 0, insertedId: /^INSERT /.test(sql) ? Number(result.raw) : undefined };
  }
}

/**
 * Sessions of plugin storage on SQLite. A call with a scope joins that transaction. Without one, a read sees the
 * committed state through the shared connection, and a write is a unit of work of its own on the serialized write
 * path (the dedicated lifecycle connection), so it queues with every plugin and core transaction. A write without
 * scope inside a transaction callback would wait for that callback, so it is rejected.
 */
export function createSqliteSessions(connection: () => DataSource, isRunning: () => boolean): PluginStorageSessions {
  return {
    async run<T>(
      access: 'read' | 'write',
      scope: PluginTransactionScope | undefined,
      work: (executor: PluginStorageExecutor) => Promise<T>,
    ): Promise<T> {
      if (scope) return work(new ManagerExecutor(handleOfScope<EntityManager>(scope)));
      if (access === 'read') return work(new ManagerExecutor(connection().manager));
      if (isRunning()) {
        throw new PluginStorageInvalid(
          'A write inside context.persistence.transaction needs the transaction scope: pass { scope } to the call.',
        );
      }
      return runSerializedTransaction(connection().manager, (manager) => work(new ManagerExecutor(manager)));
    },
  };
}
