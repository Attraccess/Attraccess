import { entities } from '@attraccess/database-entities';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DataSource } from 'typeorm';
import * as migrations from '../../migrations';
import { closeResourceTransactionConnection } from '../../sqlite/run-serialized-transaction';
import { sqliteBackend } from '../../sqlite/sqlite-backend';
import { createSqliteUnitOfWork } from '../../sqlite/sqlite-unit-of-work';
import { EntityManagerResolver } from '../entity-manager-resolver';
import { TypeOrmUsageSessionStore } from './typeorm-usage-session.store';

/**
 * A file-backed SQLite database built by the released migration track (tables, unique indexes and triggers as in
 * production), which any number of independent connections can open: each one stands for an API instance with its
 * own connection, unit of work and usage session store.
 */
export async function createMigratedUsageDatabase(prefix: string) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  const file = join(directory, 'usage.sqlite');
  const sources: DataSource[] = [];

  const open = async () => {
    const source = await sqliteBackend
      .createDataSource({
        type: 'better-sqlite3',
        invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
        database: file,
        entities: Object.values(entities),
        migrations: Object.values(migrations),
      })
      .initialize();
    sources.push(source);
    return source;
  };

  /** Opens a connection with its own unit of work and store. The first one runs the migrations. */
  const connect = async () => {
    const first = sources.length === 0;
    const source = await open();
    if (first) await source.runMigrations();
    const unitOfWork = createSqliteUnitOfWork(source);
    const store = new TypeOrmUsageSessionStore(new EntityManagerResolver(unitOfWork, source));
    return { source, unitOfWork, store };
  };

  const close = async () => {
    for (const source of sources.splice(0)) {
      await closeResourceTransactionConnection(source);
      if (source.isInitialized) await source.destroy();
    }
    await rm(directory, { recursive: true, force: true });
  };

  return { connect, close };
}

/** Rows the migrated schema requires: a user needs its unique mail address. */
export const userRow = (id: number, fields: Record<string, unknown> = {}) => ({
  id,
  username: `user-${id}`,
  email: `user-${id}@example.test`,
  ...fields,
});
