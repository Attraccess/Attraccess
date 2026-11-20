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
 * The first key of `pg_advisory_xact_lock(int, int)` for plugin transactions; the second is `hashtext(<plugin name>)`.
 * Every transaction of a plugin (its own and each write without scope) takes it first, so the transactions of one
 * plugin run one after the other, also across API instances, while core work and other plugins never wait for it.
 */
export const PLUGIN_TRANSACTION_LOCK = 584_501;

/** Waits for the transaction lock of `pluginName` in the transaction of `manager`; it is released at commit or rollback. */
export async function lockPluginTransactions(manager: EntityManager, pluginName: string): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [PLUGIN_TRANSACTION_LOCK, pluginName]);
}

/**
 * An in-process queue: `work` starts after every earlier call has settled. The host keeps one per plugin, so the
 * transactions of a plugin wait for each other in the process before they check out a pooled connection. Only one
 * connection per plugin and process can then wait for the plugin's transaction lock, and a burst of one plugin's writes
 * cannot fill the pool that core work (session authentication included) needs.
 */
export function createOrderedQueue(): <T>(work: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(work: () => Promise<T>): Promise<T> => {
    const next = tail.then(work, work);
    tail = next.catch(() => undefined);
    return next;
  };
}

/** The statement chain of each scoped transaction: statements issued through one scope run one after the other. */
const chains = new WeakMap<object, Promise<unknown>>();

function serialized<T>(key: object, work: () => Promise<T>): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve();
  const next = previous.then(work, work);
  chains.set(
    key,
    next.catch(() => undefined),
  );
  return next;
}

/**
 * Runs statements on a TypeORM entity manager (a transaction's manager, or the shared connection for reads). TypeORM
 * is only the carrier: statements are raw SQL with bound parameters built by the storage layer.
 */
export class PostgresManagerExecutor implements PluginStorageExecutor {
  /**
   * `scoped`: the manager belongs to a transaction the plugin keeps running (a scope). Each write is wrapped in a
   * savepoint: a failed statement (a unique violation the plugin catches) aborts a PostgreSQL transaction; the
   * savepoint undoes just that statement, so the transaction goes on as the neutral contract promises. The plugin may
   * issue calls through one scope concurrently (`Promise.all`), so every statement through the scope, reads included,
   * waits for the previous one: a savepoint, its statement and its release never interleave with another call.
   */
  constructor(
    private readonly manager: EntityManager,
    private readonly scoped = false,
  ) {}

  query(sql: string, params: readonly unknown[]): Promise<Record<string, unknown>[]> {
    return this.inOrder(() => this.manager.query(sql, [...params]));
  }

  async execute(sql: string, params: readonly unknown[]): Promise<PluginStorageWriteResult> {
    const result = await this.inOrder(() => this.write(sql, params));
    return { affected: result.affected ?? 0 };
  }

  async insert(sql: string, params: readonly unknown[], generatedKey: string | undefined): Promise<unknown> {
    const result = await this.inOrder(() => this.write(sql, params));
    // The statement carries `RETURNING "<key>"` (the dialect's `returning`): the engine's generated key.
    return generatedKey === undefined ? undefined : result.records?.[0]?.[generatedKey];
  }

  private inOrder<T>(work: () => Promise<T>): Promise<T> {
    return this.scoped ? serialized(this.manager.queryRunner ?? this.manager, work) : work();
  }

  private async write(
    sql: string,
    params: readonly unknown[],
  ): Promise<{ affected?: number; records?: Array<Record<string, unknown>> }> {
    const runner = this.manager.queryRunner;
    if (!runner) throw new Error('A write needs a transaction.');
    if (!this.scoped) return runner.query(sql, [...params], true);
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

export interface PostgresSessionsOptions {
  /** The plugin the sessions belong to: the name its transaction lock is taken for. */
  readonly pluginName: string;
  /** Whether the calling flow runs inside a transaction callback of this plugin. */
  isRunning(): boolean;
  /** Whether the calling flow runs inside the host's own transaction (a hook the host calls in its unit of work). */
  insideHostTransaction(): boolean;
  /** The plugin's in-process queue (see createOrderedQueue), shared with its transactions. */
  inOrder<T>(work: () => Promise<T>): Promise<T>;
}

/** Why a write without scope cannot run in the calling flow, or undefined when it can. */
function unscopedWriteRefusal(options: PostgresSessionsOptions): string | undefined {
  if (options.isRunning()) {
    return 'A write inside context.persistence.transaction needs the transaction scope: pass { scope } to the call.';
  }
  if (options.insideHostTransaction()) {
    return (
      "A plugin write cannot run inside the host's own transaction (a hook the host calls in it): it would take a " +
      'second connection beside it. Hooks read with the scope they are given and write nothing.'
    );
  }
  return undefined;
}

/**
 * Sessions of plugin storage on PostgreSQL. A call with a scope joins that transaction. Without one, a read runs on
 * the pool at once and sees committed state. A write is a transaction of its own on a pooled connection that first
 * takes the plugin's transaction lock, so it waits behind an open transaction of the same plugin (and of no other
 * plugin, nor core work). A write without scope inside a plugin transaction callback, or inside the host's own
 * transaction, is rejected: it would run beside that transaction and not in it.
 */
export function createPostgresSessions(
  connection: () => DataSource,
  options: PostgresSessionsOptions,
): PluginStorageSessions {
  return {
    async run<T>(
      access: 'read' | 'write',
      scope: PluginTransactionScope | undefined,
      work: (executor: PluginStorageExecutor) => Promise<T>,
    ): Promise<T> {
      if (scope) return work(new PostgresManagerExecutor(handleOfScope<EntityManager>(scope, access), true));
      if (access === 'read') return work(new PostgresManagerExecutor(connection().manager));
      const refusal = unscopedWriteRefusal(options);
      if (refusal) throw new PluginStorageInvalid(refusal);
      return options.inOrder(() =>
        connection().manager.transaction(async (manager) => {
          await lockPluginTransactions(manager, options.pluginName);
          return work(new PostgresManagerExecutor(manager));
        }),
      );
    },
  };
}
