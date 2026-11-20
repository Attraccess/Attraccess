import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Client } from 'pg';
import { resolveDatabaseBackend } from '../database/backend';
import { SUPPORTED_DATABASE_TYPES } from '../database/backend/database-backend';
import {
  closeTestDataSource,
  createTestDatabaseLocation,
  createTestDataSource,
  createTestDataSourceOptions,
  testAdminUrl,
} from './test-database';

const databaseExists = async (name: string) => {
  const admin = new Client({ connectionString: testAdminUrl() });
  await admin.connect();
  try {
    return ((await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])).rowCount ?? 0) > 0;
  } finally {
    await admin.end();
  }
};

describe('test database factory', () => {
  it('builds options from the selected backend, with migrations off and no schema sync unless asked', () => {
    const backend = resolveDatabaseBackend();
    const options = createTestDataSourceOptions();
    expect(options).toMatchObject({
      type: 'postgres',
      synchronize: false,
      migrationsRun: false,
      migrationsTableName: backend.migrationTrack.tableName,
    });
    expect(options.entities).toBe(backend.entities);
    expect(createTestDataSourceOptions({ synchronize: true, migrationsRun: true })).toMatchObject({
      synchronize: true,
      migrationsRun: true,
    });
  });

  it('opens a private migrated database through the backend and drops it on close, idempotently', async () => {
    const source = await createTestDataSource();
    const { current_database: name } = (await source.query('SELECT current_database()'))[0];
    expect(source.isInitialized).toBe(true);
    expect(await databaseExists(name)).toBe(true);
    // The database starts at the current release: the migrated tables are there.
    expect(await source.query(`SELECT to_regclass('public."user"') IS NOT NULL AS present`)).toEqual([
      { present: true },
    ]);
    await closeTestDataSource(source);
    expect(source.isInitialized).toBe(false);
    expect(await databaseExists(name)).toBe(false);
    await closeTestDataSource(source);
    await closeTestDataSource(undefined);
  });

  it('keeps data in a database location across independent connections', async () => {
    const database = await createTestDatabaseLocation({ empty: true });
    try {
      const first = await createTestDataSource({ location: database.location, entities: [], migrations: [] });
      await first.query('CREATE TABLE t (id integer)');
      await first.query('INSERT INTO t VALUES (1)');
      const second = await createTestDataSource({ location: database.location, entities: [], migrations: [] });
      expect(await second.query('SELECT id FROM t')).toEqual([{ id: 1 }]);
      await closeTestDataSource(first);
      await closeTestDataSource(second);
      expect(await databaseExists(database.name)).toBe(true);
    } finally {
      await database.remove();
    }
    expect(await databaseExists(database.name)).toBe(false);
  });

  it('lets a spec map only the entities and migrations it needs', () => {
    const options = createTestDataSourceOptions({ entities: [], migrations: [] });
    expect(options.entities).toEqual([]);
    expect(options.migrations).toEqual([]);
  });
});

/**
 * The operational scripts (apps/api/scripts/lib/database-provider.mjs) cannot import the TypeScript seam, so a test
 * keeps their idea of the supported backends in step with it.
 */
describe('database provider of the operational scripts', () => {
  const provider = resolve(__dirname, '../../scripts/lib/database-provider.mjs');
  const evaluate = async (source: string, env: NodeJS.ProcessEnv = {}) => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ['--input-type=module', '-e', `import * as p from ${JSON.stringify(provider)}; ${source}`],
      { env: { PATH: process.env.PATH, ...env } },
    );
    return JSON.parse(stdout);
  };

  it('supports exactly the backends of the seam, with the same default', async () => {
    expect(await evaluate('console.log(JSON.stringify(p.SUPPORTED_DATABASE_TYPES))')).toEqual([
      ...SUPPORTED_DATABASE_TYPES,
    ]);
    expect(await evaluate('console.log(JSON.stringify(p.DEFAULT_DATABASE_TYPE))')).toBe('postgres');
  });

  it('locates the database through DATABASE_URL like the application does', async () => {
    const url = 'postgres://u:p@db.example:5432/attraccess';
    expect(
      await evaluate('console.log(JSON.stringify(p.postgresProvider.defaultLocation(process.env)))', {
        DATABASE_URL: url,
      }),
    ).toBe(url);
  });
});
