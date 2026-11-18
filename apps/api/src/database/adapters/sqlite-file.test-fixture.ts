import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { entities } from '@attraccess/database-entities';
import { registerPersistenceErrorClassifier } from '../persistence-errors';
import { closeResourceTransactionConnection } from '../sqlite/run-serialized-transaction';
import { createDataSource } from '../sqlite/sqlite-connection';
import { sqliteErrorClassifier } from '../sqlite/sqlite-errors';

/**
 * One real SQLite file that several independent DataSources (separate connections, not a shared promise chain) open.
 * Concurrency guarantees of the adapters are only meaningful across such connections.
 */
export class SqliteFileFixture {
  private readonly sources: DataSource[] = [];
  private directory!: string;
  private file!: string;

  /** Creates the file; the first connection builds the schema. Busy tests open extra connections with a short timeout. */
  static async create(): Promise<SqliteFileFixture> {
    registerPersistenceErrorClassifier(sqliteErrorClassifier);
    const fixture = new SqliteFileFixture();
    fixture.directory = await mkdtemp(join(tmpdir(), 'adapter-persistence-'));
    fixture.file = join(fixture.directory, 'adapter.sqlite');
    const first = await fixture.open(true);
    await first.query(
      'CREATE TABLE sso_logout_state (key text PRIMARY KEY, value text NOT NULL, expiresAt integer NOT NULL)',
    );
    return fixture;
  }

  /** A new connection to the same file. The first call creates the schema. */
  async open(createSchema = false, busyTimeout = 5000): Promise<DataSource> {
    const source = await createDataSource({
      type: 'better-sqlite3',
      invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
      database: this.file,
      timeout: busyTimeout,
      entities: Object.values(entities),
      synchronize: createSchema,
    }).initialize();
    this.sources.push(source);
    return source;
  }

  /**
   * Takes the file's write lock on a plain, unguarded connection, as another process would, and returns its release.
   * A guarded connection's transaction would not do: a statement of the flow that owns it runs inside it instead of
   * waiting for the lock.
   */
  async holdWriteLock(): Promise<() => Promise<void>> {
    const holder = await new DataSource({
      type: 'better-sqlite3',
      invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
      database: this.file,
    }).initialize();
    await holder.query('BEGIN IMMEDIATE');
    return async () => {
      await holder.query('ROLLBACK');
      await holder.destroy();
    };
  }

  async close(): Promise<void> {
    for (const source of this.sources) {
      await closeResourceTransactionConnection(source);
      if (source.isInitialized) await source.destroy();
    }
    await rm(this.directory, { recursive: true, force: true });
  }
}
