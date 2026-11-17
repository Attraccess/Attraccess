import { AsyncLocalStorage } from 'node:async_hooks';
import type { DataSource, EntityManager, EntityTarget, ObjectLiteral, Repository } from 'typeorm';
import {
  PLUGIN_ENGINE_ACCESS,
  PluginEngineAccess,
  PluginPersistenceBackendError,
  PluginPersistenceContext,
  PluginTransactionScope,
} from '../plugin-persistence';

/**
 * SQLite persistence of a plugin: the only place of the SDK that knows TypeORM. It is reached through
 * `@attraccess/plugins-backend-sdk/sqlite` and works when the host runs SQLite; with any other engine
 * {@link sqlitePersistence} fails with a PluginPersistenceBackendError.
 */

/** Key under which a scope carries the SQLite transaction manager. */
const SCOPE_HANDLE = Symbol.for('attraccess.plugin.persistence.sqlite.scopeHandle');

interface SqliteScope extends PluginTransactionScope {
  readonly [SCOPE_HANDLE]: EntityManager;
}

/** Engine access of the SQLite implementation. */
export interface SqliteEngineAccess extends PluginEngineAccess {
  readonly backend: 'sqlite';
  connection(): DataSource;
  handleOf(scope: PluginTransactionScope): EntityManager;
  /** Whether the entity class was registered by this plugin; host tables are not reachable through repositories. */
  ownsEntity(entity: unknown): boolean;
}

export interface SqlitePluginPersistenceOptions {
  pluginName: string;
  /** The shared connection. It may throw until the host finished bootstrapping; repositories then resolve lazily. */
  connection(): DataSource;
  /** Entity classes this plugin registered (`persistence.sqlite.entities`). */
  entities?: readonly unknown[];
  /**
   * Runs `work` in one transaction. The host supplies its serialized write path; the default is a plain transaction
   * on the connection.
   */
  runInTransaction?<T>(work: (manager: EntityManager) => Promise<T>): Promise<T>;
  /** Called when a post-commit callback throws. It must not throw. */
  onCallbackError?(error: unknown): void;
}

class OwnedScope implements SqliteScope {
  private open = true;
  readonly callbacks: Array<() => void | Promise<void>> = [];
  readonly [SCOPE_HANDLE]: EntityManager;

  constructor(manager: EntityManager) {
    this[SCOPE_HANDLE] = manager;
  }

  get isOpen(): boolean {
    return this.open;
  }

  afterCommit(callback: () => void | Promise<void>): void {
    if (!this.open) throw new Error('Cannot register a post-commit callback on a closed transaction scope');
    this.callbacks.push(callback);
  }

  close(): void {
    this.open = false;
  }
}

/**
 * Whether the transaction behind `manager` is still running. A manager bound to a query runner (what a TypeORM
 * transaction hands out) is open until that transaction commits or rolls back; a manager without one is not a
 * transaction that could end.
 */
function transactionActive(manager: EntityManager): boolean {
  const runner = manager.queryRunner;
  return !runner || (runner.isTransactionActive && !runner.isReleased);
}

/**
 * The scope of a transaction the host opened itself (for example the start transaction handed to a capacity hook).
 * It exposes the transaction to {@link SqlitePersistence.managerOf}; it never commits, so it cannot defer work.
 * It is open only while the host transaction is: by default until the transaction of the manager's query runner
 * commits or rolls back. The host passes `isOpen` when it tracks the transaction's end itself (TypeORM's SQLite drivers reuse
 * one query runner per connection, so only the host knows that a later transaction is a different one).
 */
export function createHostTransactionScope(
  manager: EntityManager,
  isOpen: () => boolean = () => transactionActive(manager),
): PluginTransactionScope {
  return {
    get isOpen(): boolean {
      return isOpen();
    },
    afterCommit(): void {
      throw new Error('afterCommit is not available in a transaction owned by the host');
    },
    [SCOPE_HANDLE]: manager,
  } as SqliteScope;
}

/**
 * The SQLite transaction behind an open scope (a plugin transaction or a host-owned one). Hosts use it to run a
 * lookup a plugin asked for inside the plugin's transaction. Throws for a closed or foreign scope.
 */
export function managerOfTransactionScope(scope: PluginTransactionScope): EntityManager {
  return managerOfScope(scope);
}

function managerOfScope(scope: PluginTransactionScope): EntityManager {
  const handle = (scope as Partial<SqliteScope>)[SCOPE_HANDLE];
  if (!handle) {
    throw new PluginPersistenceBackendError(
      'sqlite',
      'another engine',
      'The transaction scope does not belong to the SQLite engine.',
    );
  }
  if (!scope.isOpen) throw new Error('The transaction scope is closed');
  return handle;
}

/**
 * The SQLite implementation of {@link PluginPersistenceContext}. The host builds the plugin's context with it;
 * plugin tests use it to run against their own in-memory or file database.
 *
 * SQLite has a single writer: the host runs every transaction (plugin transactions and core lifecycle writes such as
 * session start and end) one at a time on one shared write queue, so a check-then-write sequence is race-free. Because
 * the queue is shared, a slow `work` delays every session start and end, and a transaction started (or a core write
 * awaited) inside `work` would wait for `work` itself: the nested call is rejected with an error.
 */
export function createSqlitePluginPersistence(options: SqlitePluginPersistenceOptions): PluginPersistenceContext {
  const running = new AsyncLocalStorage<{ active: boolean }>();
  const runInTransaction =
    options.runInTransaction ??
    (<T>(work: (manager: EntityManager) => Promise<T>) => options.connection().transaction((manager) => work(manager)));

  const access: SqliteEngineAccess = {
    backend: 'sqlite',
    connection: () => options.connection(),
    handleOf: managerOfScope,
    ownsEntity: (entity) => (options.entities ?? []).includes(entity),
  };

  async function transaction<T>(work: (scope: PluginTransactionScope) => Promise<T>): Promise<T> {
    if (running.getStore()?.active) {
      throw new Error(
        `Plugin "${options.pluginName}" started a transaction inside a transaction callback. Nested calls would ` +
          'deadlock on the shared write queue; pass the callback scope down instead.',
      );
    }
    const owned: { scope?: OwnedScope } = {};
    let result: T;
    try {
      result = await runInTransaction((manager) => {
        const scope = new OwnedScope(manager);
        owned.scope = scope;
        const marker = { active: true };
        return running.run(marker, async () => {
          try {
            return await work(scope);
          } finally {
            marker.active = false;
          }
        });
      });
    } finally {
      owned.scope?.close();
    }
    for (const callback of owned.scope?.callbacks ?? []) {
      try {
        await callback();
      } catch (error) {
        options.onCallbackError?.(error);
      }
    }
    return result;
  }

  return {
    backend: 'sqlite',
    supports: (backend) => backend === 'sqlite',
    transaction,
    [PLUGIN_ENGINE_ACCESS]: access,
  };
}

/** SQLite persistence helpers of one plugin. */
export interface SqlitePersistence {
  /** The host's shared connection manager, for reads outside a transaction. */
  readonly manager: EntityManager;
  /**
   * Repository of an entity this plugin registered in `persistence.sqlite.entities`. Host tables are not reachable
   * through it. A repository retained during bootstrap resolves when first used.
   */
  getRepository<T extends ObjectLiteral>(entity: EntityTarget<T>): Repository<T>;
  /** The SQLite transaction behind a scope of {@link PluginPersistenceContext.transaction}. */
  managerOf(scope: PluginTransactionScope): EntityManager;
  /**
   * {@link PluginPersistenceContext.transaction} with the SQLite manager passed along. Same rules: serialized,
   * short, no I/O inside, no nesting, effects through `scope.afterCommit`.
   */
  transaction<T>(work: (manager: EntityManager, scope: PluginTransactionScope) => Promise<T>): Promise<T>;
}

function sqliteAccessOf(persistence: PluginPersistenceContext): SqliteEngineAccess {
  if (persistence.backend !== 'sqlite') throw new PluginPersistenceBackendError('sqlite', persistence.backend);
  return persistence[PLUGIN_ENGINE_ACCESS] as SqliteEngineAccess;
}

/**
 * Wraps a repository the connection could not hand out yet (Nest builds plugin providers before the host injects
 * the connection). Every use resolves the real repository, which throws a clear error while the host still boots.
 */
function deferredRepository<T extends ObjectLiteral>(resolve: () => Repository<T>): Repository<T> {
  let resolved: Repository<T> | undefined;
  const repository = (): Repository<T> => (resolved ??= resolve());
  return new Proxy({} as Repository<T>, {
    get: (_, property) => {
      const actual = repository();
      const value = Reflect.get(actual, property, actual);
      return typeof value === 'function' ? value.bind(actual) : value;
    },
    set: (_, property, value) => Reflect.set(repository(), property, value),
  });
}

function isBootstrapPending(error: unknown): boolean {
  return error instanceof Error && /not available yet/.test(error.message);
}

/**
 * SQLite persistence of the plugin behind `context`. Throws a PluginPersistenceBackendError when the host runs
 * another engine, so SQLite-only plugin code fails clearly instead of misbehaving. Requires DATABASE_ACCESS.
 */
export function sqlitePersistence(context: { readonly persistence: PluginPersistenceContext }): SqlitePersistence {
  const persistence = context.persistence;
  const access = sqliteAccessOf(persistence);
  const repositoryOf = <T extends ObjectLiteral>(entity: EntityTarget<T>): Repository<T> => {
    if (!access.ownsEntity(entity)) {
      throw new Error(
        'getRepository only serves entity classes this plugin registered in persistence.sqlite.entities; ' +
          'host tables are not part of the plugin API.',
      );
    }
    return access.connection().getRepository(entity);
  };
  return {
    get manager(): EntityManager {
      return access.connection().manager;
    },
    getRepository<T extends ObjectLiteral>(entity: EntityTarget<T>): Repository<T> {
      try {
        return repositoryOf(entity);
      } catch (error) {
        if (!isBootstrapPending(error)) throw error;
        return deferredRepository(() => repositoryOf(entity));
      }
    },
    managerOf: (scope) => access.handleOf(scope),
    transaction: (work) => persistence.transaction((scope) => work(access.handleOf(scope), scope)),
  };
}
