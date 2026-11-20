import { Client } from 'pg';
import type { DataSource } from 'typeorm';
import { createTestDatabaseLocation, type TestDatabaseLocation } from '../../test-utils/test-database';
import { postgresBackend } from '../postgres/postgres-backend';
import { postgresConnectionOptions } from '../postgres/postgres-connection';
import type { BackendFixture, ConformanceConnection, ConformanceDatabase } from './backend-fixture';

/** The held write lock: it blocks row locks and writes on the account table, reads stay possible. */
const HOLD_LOCK = 'LOCK TABLE account IN EXCLUSIVE MODE';

/** Options of one independent connection (own pool) with its own lock timeout. */
export function conformanceOptions(url: string, lockTimeoutMs: number) {
  const options = postgresConnectionOptions({ url, ssl: 'off', poolMax: 2, schema: 'public' });
  const extra = (options as { extra: { options: string } }).extra;
  return {
    ...options,
    entities: [],
    extra: { ...extra, options: extra.options.replace(/lock_timeout=\d+/, `lock_timeout=${lockTimeoutMs}`) },
  } as never;
}

/** One new database per `create()` on the test server, one DataSource (own pool) per `connect()`. */
export const postgresFixture: BackendFixture = {
  name: 'postgres',
  async create(): Promise<ConformanceDatabase> {
    const location: TestDatabaseLocation = await createTestDatabaseLocation({ empty: true });
    const sources: DataSource[] = [];
    const holders: Client[] = [];

    const open = async (lockTimeoutMs = 10_000): Promise<DataSource> => {
      const source = postgresBackend.createDataSource(conformanceOptions(location.location, lockTimeoutMs));
      await source.initialize();
      sources.push(source);
      return source;
    };

    const setup = await open();
    await setup.query('CREATE TABLE account (id INTEGER PRIMARY KEY, balance INTEGER NOT NULL)');
    await setup.query('INSERT INTO account VALUES (1, 0), (2, 0)');
    await setup.query('CREATE TABLE unique_key (key TEXT PRIMARY KEY)');

    return {
      async connect(options = {}): Promise<ConformanceConnection> {
        const source = await open(options.lockTimeoutMs);
        const unitOfWork = postgresBackend.createUnitOfWork(source);
        return {
          unitOfWork,
          async addToBalance(scope, accountId, delta) {
            const manager = unitOfWork.handleOf(scope);
            // READ COMMITTED: the row lock is what serialises two writers of one account, as in the adapters.
            const [{ balance }] = await manager.query('SELECT balance FROM account WHERE id = $1 FOR UPDATE', [
              accountId,
            ]);
            await manager.query('UPDATE account SET balance = $1 WHERE id = $2', [balance + delta, accountId]);
          },
          async insertUnique(scope, key) {
            await unitOfWork.handleOf(scope).query('INSERT INTO unique_key VALUES ($1)', [key]);
          },
          async balance(accountId) {
            const [{ balance }] = await source.query('SELECT balance FROM account WHERE id = $1', [accountId]);
            return balance;
          },
          classify: (error) => postgresBackend.errors.classify(error),
        };
      },
      async induceBusy() {
        const holder = new Client({ connectionString: location.location });
        await holder.connect();
        holders.push(holder);
        await holder.query('BEGIN');
        await holder.query(HOLD_LOCK);
        return async () => {
          await holder.query('ROLLBACK').catch(() => undefined);
          await holder.end().catch(() => undefined);
        };
      },
      async close() {
        for (const holder of holders) await holder.end().catch(() => undefined);
        for (const source of sources) {
          if (source.isInitialized) await source.destroy();
        }
        await location.remove();
      },
    };
  },
};
