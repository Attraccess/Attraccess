import { DataSource, EntityManager } from 'typeorm';

const sqliteTransactions = new WeakMap<DataSource, Promise<unknown>>();
const resourceConnections = new WeakMap<DataSource, Promise<DataSource>>();

async function getResourceConnection(source: DataSource): Promise<DataSource> {
  if (source.options.type !== 'sqlite') return source;
  if (source.options.database === ':memory:') {
    throw new Error('Resource transactions require a file-backed SQLite database for independent commits');
  }
  let connection = resourceConnections.get(source);
  if (!connection) {
    connection = new DataSource({
      ...source.options,
      name: 'resource-lifecycle',
      synchronize: false,
      migrationsRun: false,
      dropSchema: false,
      busyTimeout: source.options.busyTimeout ?? 5000,
    }).initialize();
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
  if (connection?.options?.type !== 'sqlite') {
    return manager.transaction(work);
  }
  const previous = sqliteTransactions.get(connection) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const dedicated = await getResourceConnection(connection);
      // Refresh before each phase: Nest services may register commit observers after initialization.
      dedicated.subscribers.splice(0, dedicated.subscribers.length, ...connection.subscribers);
      return dedicated.transaction(work);
    });
  sqliteTransactions.set(connection, next);
  try {
    return await next;
  } finally {
    if (sqliteTransactions.get(connection) === next) sqliteTransactions.delete(connection);
  }
}
