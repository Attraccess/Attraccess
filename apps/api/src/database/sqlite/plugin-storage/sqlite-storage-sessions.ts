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
    const result = await this.write(sql, params);
    return { affected: result.affected ?? 0 };
  }

  async insert(sql: string, params: readonly unknown[], generatedKey: string | undefined): Promise<unknown> {
    const result = await this.write(sql, params);
    // For an INSERT the driver reports the last row id: the generated INTEGER PRIMARY KEY.
    return generatedKey === undefined ? undefined : Number(result.raw);
  }

  private write(sql: string, params: readonly unknown[]): Promise<{ affected?: number; raw: unknown }> {
    const runner = this.manager.queryRunner;
    if (!runner) throw new Error('A write needs a transaction.');
    return runner.query(sql, [...params], true);
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
