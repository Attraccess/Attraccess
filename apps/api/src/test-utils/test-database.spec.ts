import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { resolveDatabaseBackend } from '../database/backend';
import { SUPPORTED_DATABASE_TYPES } from '../database/backend/database-backend';
import { resolveDatabasePath } from '../config/storage-path';
import {
  closeTestDataSource,
  createTestDatabaseLocation,
  createTestDataSource,
  createTestDataSourceOptions,
} from './test-database';

describe('test database factory', () => {
  it('builds options from the selected backend, with migrations off and no schema sync unless asked', () => {
    const backend = resolveDatabaseBackend();
    const options = createTestDataSourceOptions();
    expect(options).toMatchObject({
      type: backend.createDataSourceOptions().type,
      database: ':memory:',
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

  it('opens through the backend connection factory and closes idempotently', async () => {
    const source = await createTestDataSource();
    expect(source.isInitialized).toBe(true);
    await source.query('CREATE TABLE t (id integer)');
    await closeTestDataSource(source);
    expect(source.isInitialized).toBe(false);
    await closeTestDataSource(source);
    await closeTestDataSource(undefined);
  });

  it('keeps data in a file location across independent connections', async () => {
    const database = await createTestDatabaseLocation();
    try {
      const first = await createTestDataSource({ location: database.location });
      await first.query('CREATE TABLE t (id integer)');
      await first.query('INSERT INTO t VALUES (1)');
      const second = await createTestDataSource({ location: database.location });
      expect(await second.query('SELECT id FROM t')).toEqual([{ id: 1 }]);
      await closeTestDataSource(first);
      await closeTestDataSource(second);
    } finally {
      await database.remove();
    }
    expect(existsSync(database.directory)).toBe(false);
  });

  it('lets a spec map only the entities and migrations it needs', () => {
    const options = createTestDataSourceOptions({ entities: [], migrations: [] });
    expect(options.entities).toEqual([]);
    expect(options.migrations).toEqual([]);
  });
});

/**
 * The operational scripts (apps/api/scripts/lib/database-provider.mjs) cannot import the TypeScript seam, so a test
 * keeps their idea of the supported backends and of the default database location in step with it.
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
    expect(await evaluate('console.log(JSON.stringify(p.DEFAULT_DATABASE_TYPE))')).toBe('sqlite');
  });

  it('locates the sqlite database where the application does', async () => {
    const env = { STORAGE_ROOT: 'relative/storage' };
    const cwd = resolve(__dirname, '../../../..');
    expect(
      await evaluate(
        `console.log(JSON.stringify(p.sqliteProvider.defaultLocation(process.env, ${JSON.stringify(cwd)})))`,
        env,
      ),
    ).toBe(resolveDatabasePath(env, cwd));
    expect(
      await evaluate(`console.log(JSON.stringify(p.sqliteProvider.defaultLocation({}, ${JSON.stringify(cwd)})))`),
    ).toBe(resolveDatabasePath({}, cwd));
  });
});
