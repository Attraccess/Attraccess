import type { DataSource, EntityManager } from 'typeorm';
import { PluginStorageInvalid, type PluginTransactionScope } from '@attraccess/plugins-backend-sdk';
import { handleOfScope } from '../../../plugin-system/persistence/plugin-transaction-scope';
import type {
  PluginStorageExecutor,
  PluginStorageSessions,
  PluginStorageWriteResult,
} from '../../../plugin-system/plugin-storage/storage-dialect.port';
import { insideSerializedTransaction, runSerializedTransaction } from '../run-serialized-transaction';

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

/** Why a write without scope cannot run in the calling flow, or undefined when it can. */
function unscopedWriteRefusal(connection: DataSource, isRunning: () => boolean): string | undefined {
  if (isRunning()) {
    return 'A write inside context.persistence.transaction needs the transaction scope: pass { scope } to the call.';
  }
  if (insideSerializedTransaction(connection.manager)) {
    return (
      "A plugin write cannot run inside the host's own transaction (a hook the host calls in it): it would wait " +
      'for that transaction. Hooks read with the scope they are given and write nothing.'
    );
  }
  return undefined;
}

/**
 * Sessions of plugin storage on SQLite. A call with a scope joins that transaction. Without one, a read runs on the
 * shared connection at once: it sees the committed state (a flow that owns a transaction of the database joins it).
 * A write is a unit of work of its own on the serialized write path (the dedicated lifecycle connection), so it
 * queues with every plugin and core transaction. A write without scope inside a plugin transaction callback, or
 * inside the host's own serialized transaction (a hook), would wait for that transaction, so it is rejected.
 */
export function createSqliteSessions(connection: () => DataSource, isRunning: () => boolean): PluginStorageSessions {
  return {
    async run<T>(
      access: 'read' | 'write',
      scope: PluginTransactionScope | undefined,
      work: (executor: PluginStorageExecutor) => Promise<T>,
    ): Promise<T> {
      if (scope) return work(new ManagerExecutor(handleOfScope<EntityManager>(scope, access)));
      if (access === 'read') return work(new ManagerExecutor(connection().manager));
      const refusal = unscopedWriteRefusal(connection(), isRunning);
      if (refusal) throw new PluginStorageInvalid(refusal);
      return runSerializedTransaction(connection().manager, (manager) => work(new ManagerExecutor(manager)));
    },
  };
}
