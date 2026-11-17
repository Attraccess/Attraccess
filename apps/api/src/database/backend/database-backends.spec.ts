import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { DATABASE_BACKENDS, resolveDatabaseBackend } from './resolve-database-backend';
import { SUPPORTED_DATABASE_TYPES } from './database-type';

// The webpack config of the migration datasource loads this plain CommonJS module before TypeScript exists.
const tracks = require('../../../migration-tracks.cjs') as { MIGRATION_TRACK_DIRECTORIES: Record<string, string> };

const sorted = (values: Iterable<string>) => [...values].sort();

/** The operational scripts' list of database providers (plain ESM, read in a child process). */
async function scriptProviders(): Promise<string[]> {
  const provider = resolve(__dirname, '../../../scripts/lib/database-provider.mjs');
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import * as p from ${JSON.stringify(provider)}; console.log(JSON.stringify(p.SUPPORTED_DATABASE_TYPES))`,
    ],
    { env: { PATH: process.env.PATH } },
  );
  return JSON.parse(stdout);
}

/**
 * Adding a backend means adding one object to DATABASE_BACKENDS. Every other place that names the supported engines
 * must agree with it, so a backend cannot be half added.
 */
describe('the supported database engines', () => {
  const engines = sorted(SUPPORTED_DATABASE_TYPES);

  it('has exactly one backend object per supported type, each naming its own type', () => {
    expect(sorted(Object.keys(DATABASE_BACKENDS))).toEqual(engines);
    for (const [type, backend] of Object.entries(DATABASE_BACKENDS)) {
      expect(backend.type).toBe(type);
      expect(resolveDatabaseBackend({ DATABASE_TYPE: type })).toBe(backend);
    }
  });

  it('agrees with the migration tracks of the build and the operational scripts', async () => {
    expect(sorted(Object.keys(tracks.MIGRATION_TRACK_DIRECTORIES))).toEqual(engines);
    expect(sorted(await scriptProviders())).toEqual(engines);
  });

  it('brings every backend its plugin storage: persistence host, migration engine and the tables it owns', () => {
    for (const backend of Object.values(DATABASE_BACKENDS)) {
      const host = backend.plugins.createPersistenceHost(() => undefined);
      expect(typeof host.createContexts).toBe('function');
      expect(backend.plugins.createMigrationEngine(null)).toEqual(
        expect.objectContaining({
          migrate: expect.any(Function),
          assess: expect.any(Function),
          dropAll: expect.any(Function),
        }),
      );
      expect(backend.plugins.coreTableNames().size).toBeGreaterThan(10);
    }
  });
});
