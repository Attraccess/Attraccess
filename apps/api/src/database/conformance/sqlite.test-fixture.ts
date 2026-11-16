import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { sqliteBackend } from '../sqlite/sqlite-backend';
import { createSqliteUnitOfWork } from '../sqlite/sqlite-unit-of-work';
import type { BackendFixture, ConformanceConnection, ConformanceDatabase } from './backend-fixture';

/** Real SQLite files, one DataSource (and so one set of connections) per `connect()`. */
export const sqliteFixture: BackendFixture = {
  name: 'sqlite',
  async create(): Promise<ConformanceDatabase> {
    const directory = await mkdtemp(join(tmpdir(), 'conformance-'));
    const file = join(directory, 'conformance.sqlite');
    const sources: DataSource[] = [];

    const open = async (): Promise<DataSource> => {
      const source = await sqliteBackend.createDataSource({ type: 'sqlite', database: file }).initialize();
      sources.push(source);
      return source;
    };

    const setup = await open();
    await setup.query('CREATE TABLE account (id INTEGER PRIMARY KEY, balance INTEGER NOT NULL)');
    await setup.query('INSERT INTO account VALUES (1, 0), (2, 0)');
    await setup.query('CREATE TABLE unique_key (key TEXT PRIMARY KEY)');

    return {
      async connect(): Promise<ConformanceConnection> {
        const source = await open();
        const unitOfWork = createSqliteUnitOfWork(source);
        return {
          unitOfWork,
          async addToBalance(scope, accountId, delta) {
            const manager = unitOfWork.handleOf(scope);
            const [{ balance }] = await manager.query('SELECT balance FROM account WHERE id = ?', [accountId]);
            await manager.query('UPDATE account SET balance = ? WHERE id = ?', [balance + delta, accountId]);
          },
          async insertUnique(scope, key) {
            await unitOfWork.handleOf(scope).query('INSERT INTO unique_key VALUES (?)', [key]);
          },
          async balance(accountId) {
            const [{ balance }] = await source.query('SELECT balance FROM account WHERE id = ?', [accountId]);
            return balance;
          },
          classify: (error) => sqliteBackend.errors.classify(error),
        };
      },
      async close() {
        for (const source of sources) {
          await sqliteBackend.shutdown(source);
          if (source.isInitialized) await source.destroy();
        }
        await rm(directory, { recursive: true, force: true });
      },
    };
  },
};
