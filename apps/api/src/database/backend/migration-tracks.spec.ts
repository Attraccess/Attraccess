import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { postgresBackend } from '../postgres/postgres-backend';
import { DEFAULT_DATABASE_TYPE, SUPPORTED_DATABASE_TYPES } from './database-backend';

interface MigrationTracks {
  DEFAULT_DATABASE_TYPE: string;
  MIGRATION_TRACK_DIRECTORIES: Record<string, string>;
  resolveMigrationTrack(env: NodeJS.ProcessEnv): { type: string; directory: string };
}

// The webpack config of the migration datasource loads this plain CommonJS module before TypeScript exists.
const tracks = require('../../../migration-tracks.cjs') as MigrationTracks;
const repositoryRoot = resolve(__dirname, '../../../../..');

describe('migration track selection for the migration datasource build', () => {
  it('offers exactly the supported backends and the same default', () => {
    expect(Object.keys(tracks.MIGRATION_TRACK_DIRECTORIES).sort()).toEqual([...SUPPORTED_DATABASE_TYPES].sort());
    expect(tracks.DEFAULT_DATABASE_TYPE).toBe(DEFAULT_DATABASE_TYPE);
  });

  it('points every track at the directory its backend declares, and that directory exists', () => {
    expect(tracks.MIGRATION_TRACK_DIRECTORIES.postgres).toBe(postgresBackend.migrationTrack.directory);
    for (const directory of Object.values(tracks.MIGRATION_TRACK_DIRECTORIES)) {
      expect(existsSync(join(repositoryRoot, directory, 'index.ts'))).toBe(true);
    }
  });

  it('selects the postgres track by default and case-insensitively', () => {
    expect(tracks.resolveMigrationTrack({}).type).toBe('postgres');
    expect(tracks.resolveMigrationTrack({ DATABASE_TYPE: '  ' }).type).toBe('postgres');
    expect(tracks.resolveMigrationTrack({ DATABASE_TYPE: 'PostgreS' })).toEqual({
      type: 'postgres',
      directory: postgresBackend.migrationTrack.directory,
    });
  });

  it('rejects an unsupported type without echoing anything that is not a plain name', () => {
    expect(() => tracks.resolveMigrationTrack({ DATABASE_TYPE: 'sqlite' })).toThrow(
      'Unsupported DATABASE_TYPE "sqlite". Supported values: postgres.',
    );
    expect(() => tracks.resolveMigrationTrack({ DATABASE_TYPE: 'postgres://user:secret@host/db' })).toThrow(
      /\(redacted: not a database type name\)/,
    );
    expect(() => tracks.resolveMigrationTrack({ DATABASE_TYPE: '__proto__' })).toThrow(/Unsupported DATABASE_TYPE/);
  });

  describe('webpack.config.migrations.js', () => {
    const configPath = resolve(__dirname, '../../../webpack.config.migrations.js');
    const loadConfig = (databaseType: string | undefined) => {
      const previous = process.env.DATABASE_TYPE;
      if (databaseType === undefined) delete process.env.DATABASE_TYPE;
      else process.env.DATABASE_TYPE = databaseType;
      try {
        let loaded: { entry: Record<string, string> } | undefined;
        jest.isolateModules(() => {
          // The Nx plugin needs a project graph; only the entry points of the config are under test.
          jest.doMock('@nx/webpack/app-plugin', () => ({ NxAppWebpackPlugin: class {} }));
          loaded = require(configPath);
        });
        return loaded as unknown as { entry: Record<string, string> };
      } finally {
        if (previous === undefined) delete process.env.DATABASE_TYPE;
        else process.env.DATABASE_TYPE = previous;
      }
    };
    const root = (file: string) => join(repositoryRoot, file);

    it('builds the postgres track as entries of the datasource bundle', () => {
      const previousCwd = process.cwd();
      process.chdir(repositoryRoot);
      try {
        const { entry } = loadConfig('postgres');
        expect(entry.main).toBe('./apps/api/src/database/datasource.ts');
        expect(entry['./postgres/migrations/index.ts']).toBe('apps/api/src/database/postgres/migrations/index.ts');
        expect(entry['./postgres/migrations/1760000000000-baseline.ts']).toBeDefined();
        // The frozen SQLite track is not a migration track of the build: it only runs on a copy during the import.
        expect(Object.keys(entry).some((key) => key.startsWith('./migrations/'))).toBe(false);
      } finally {
        process.chdir(previousCwd);
      }
    });

    it('fails the build before compiling anything when DATABASE_TYPE is not supported', () => {
      expect(() => loadConfig('oracle')).toThrow('Unsupported DATABASE_TYPE "oracle"');
      expect(() => loadConfig('sqlite')).toThrow('Unsupported DATABASE_TYPE "sqlite"');
    });

    it('keeps the nx cache of the migration datasource per database type', () => {
      const project = JSON.parse(readFileSync(root('apps/api/project.json'), 'utf8'));
      expect(project.targets['build-migration-datasource'].inputs).toEqual(
        expect.arrayContaining([{ env: 'DATABASE_TYPE' }, '{projectRoot}/migration-tracks.cjs']),
      );
      for (const target of ['migration-generate', 'migrations-run', 'migration-revert']) {
        expect(project.targets[target].dependsOn).toContain('build-migration-datasource');
      }
    });
  });
});
