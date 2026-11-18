import { AsyncLocalStorage } from 'node:async_hooks';
import { DataSource, EntityManager } from 'typeorm';
import { createDataSource } from './sqlite-connection';

const sqliteTransactions = new WeakMap<DataSource, Promise<unknown>>();
const resourceConnections = new WeakMap<DataSource, Promise<DataSource>>();
const connectionHooks = new WeakMap<DataSource, Array<(connection: DataSource) => void>>();
/** The connections whose serialized transaction the calling async flow runs in, while that transaction runs. */
const serializedFlows = new AsyncLocalStorage<{ readonly connections: ReadonlySet<DataSource>; active: boolean }>();

/**
 * Whether the calling async flow runs inside a serialized transaction of `manager`'s connection that has not ended.
 * Another serialized transaction started there would queue behind it and so wait for itself.
 */
export function insideSerializedTransaction(manager: EntityManager): boolean {
  const flow = serializedFlows.getStore();
  return flow?.active === true && flow.connections.has(manager.connection);
}

/**
 * Applies `hook` to the dedicated resource-lifecycle connection of `source` (query instrumentation): right away when it
 * is open, otherwise as soon as it opens. A connection reopened after shutdown gets the hook again.
 */
export function onResourceConnection(source: DataSource, hook: (connection: DataSource) => void): void {
  const hooks = connectionHooks.get(source) ?? [];
  hooks.push(hook);
  connectionHooks.set(source, hooks);
  void resourceConnections.get(source)?.then(hook, () => undefined);
}

function applyConnectionHooks(source: DataSource, connection: DataSource): DataSource {
  for (const hook of connectionHooks.get(source) ?? []) hook(connection);
  return connection;
}

async function getResourceConnection(source: DataSource): Promise<DataSource> {
  if (source.options.type !== 'better-sqlite3') return source;
  if (source.options.database === ':memory:') {
    throw new Error('Resource transactions require a file-backed SQLite database for independent commits');
  }
  let connection = resourceConnections.get(source);
  if (!connection) {
    connection = createDataSource({
      ...source.options,
      synchronize: false,
      migrationsRun: false,
      dropSchema: false,
    })
      .initialize()
      .then((opened) => applyConnectionHooks(source, opened));
    resourceConnections.set(source, connection);
  }
  return connection;
}

export async function closeResourceTransactionConnection(source: DataSource): Promise<void> {
  const pending = resourceConnections.get(source);
  if (!pending) return;
  await sqliteTransactions.get(source)?.catch(() => undefined);
  try {
    const connection = await pending;
    if (connection.isInitialized) await connection.destroy();
  } finally {
    resourceConnections.delete(source);
    sqliteTransactions.delete(source);
  }
}

/**
 * Lifecycle and observation writes use one dedicated connection to the SAME SQLite file.
 * This prevents unrelated application transactions from absorbing accepted observations.
 * Only short database phases are serialized; external flow execution never runs here.
 */
export async function runSerializedTransaction<T>(
  manager: EntityManager,
  work: (transaction: EntityManager) => Promise<T>,
): Promise<T> {
  const connection = manager.connection;
  if (connection?.options?.type !== 'better-sqlite3') {
    return manager.transaction(work);
  }
  const previous = sqliteTransactions.get(connection) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const dedicated = await getResourceConnection(connection);
      // Refresh before each phase: Nest services may register commit observers after initialization.
      dedicated.subscribers.splice(0, dedicated.subscribers.length, ...connection.subscribers);
      // createDataSource begins its transactions with BEGIN IMMEDIATE: a deferred read-to-write upgrade can fail
      // immediately with SQLITE_BUSY even when busyTimeout is configured.
      const outer = serializedFlows.getStore();
      const marker = { connections: new Set([...(outer?.active ? outer.connections : []), connection]), active: true };
      return serializedFlows.run(marker, async () => {
        try {
          return await dedicated.transaction(work);
        } finally {
          marker.active = false;
        }
      });
    });
  sqliteTransactions.set(connection, next);
  try {
    return await next;
  } finally {
    if (sqliteTransactions.get(connection) === next) sqliteTransactions.delete(connection);
  }
}
