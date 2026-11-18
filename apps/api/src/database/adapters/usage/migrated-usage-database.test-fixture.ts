import type { DataSource } from 'typeorm';
import {
  closeTestDataSource,
  createTestDatabaseLocation,
  createTestDataSource,
} from '../../../test-utils/test-database';
import { EntityManagerResolver } from '../entity-manager-resolver';
import { unitOfWorkFor } from '../shared-unit-of-work';
import { TypeOrmUsageSessionStore } from './typeorm-usage-session.store';

/**
 * A PostgreSQL database built by the released migration track (tables, unique indexes and triggers as in
 * production), which any number of independent connections can open: each one stands for an API instance with its
 * own pool, unit of work and usage session store. The database is dropped by `close`.
 */
export async function createMigratedUsageDatabase(_prefix = 'usage') {
  const database = await createTestDatabaseLocation();
  const sources: DataSource[] = [];

  /** Opens a connection with its own unit of work and store. */
  const connect = async () => {
    const source = await createTestDataSource({ location: database.location });
    sources.push(source);
    const unitOfWork = unitOfWorkFor(source);
    const store = new TypeOrmUsageSessionStore(new EntityManagerResolver(unitOfWork, source));
    return { source, unitOfWork, store };
  };

  const close = async () => {
    for (const source of sources.splice(0)) await closeTestDataSource(source);
    await database.remove();
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

/**
 * Inserts a row under a fixed id. TypeORM leaves the id of a generated column to the sequence even when the entity
 * carries one, so a spec that refers to such an id by number writes the row itself.
 */
export async function insertRow(source: DataSource, table: string, values: Record<string, unknown>) {
  const columns = Object.keys(values);
  await source.query(
    `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(', ')}) VALUES (${columns
      .map((_, index) => `$${index + 1}`)
      .join(', ')})`,
    Object.values(values),
  );
}

export const insertProject = (source: DataSource, project: { id: number; name: string; ownerId: number }) =>
  insertRow(source, 'project', { id: project.id, name: project.name, userId: project.ownerId });
