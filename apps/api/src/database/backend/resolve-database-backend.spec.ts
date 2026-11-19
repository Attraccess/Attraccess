import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { UPGRADE_DOCS_URL as POSTGRES_CONFIG_DOCS_URL } from '../postgres/postgres-config';
import { postgresBackend } from '../postgres/postgres-backend';
import { UPGRADE_DOCS_URL } from './database-type';
import { parseDatabaseType, resolveDatabaseBackend, UnsupportedDatabaseTypeError } from './resolve-database-backend';

describe('database backend selection', () => {
  it('defaults to postgres and accepts it explicitly, ignoring blanks and case', () => {
    expect(resolveDatabaseBackend({}).type).toBe('postgres');
    expect(resolveDatabaseBackend({ DATABASE_TYPE: '' }).type).toBe('postgres');
    expect(resolveDatabaseBackend({ DATABASE_TYPE: '  ' }).type).toBe('postgres');
    expect(resolveDatabaseBackend({ DATABASE_TYPE: ' PostgreS ' })).toBe(postgresBackend);
    expect(parseDatabaseType({})).toBe('postgres');
  });

  it('exposes the postgres migration track under the migrations table name', () => {
    const track = resolveDatabaseBackend({}).migrationTrack;
    expect(track.name).toBe('postgres');
    expect(track.tableName).toBe('migrations');
    expect(track.directory).toBe('apps/api/src/database/postgres/migrations');
    expect(track.migrations.filter((candidate) => typeof candidate === 'function')).toHaveLength(1);
  });

  it('rejects sqlite before touching a database and points to the upgrade instructions', () => {
    expect(() => resolveDatabaseBackend({ DATABASE_TYPE: 'sqlite' })).toThrow(UnsupportedDatabaseTypeError);
    expect(() => resolveDatabaseBackend({ DATABASE_TYPE: 'sqlite' })).toThrow(/no longer supported.*PostgreSQL/s);
    expect(() => resolveDatabaseBackend({ DATABASE_TYPE: 'sqlite' })).toThrow(UPGRADE_DOCS_URL);
    // Any spelling of the value is refused, and the docs are linked.
    expect(() => resolveDatabaseBackend({ DATABASE_TYPE: ' SQLite ' })).toThrow(UPGRADE_DOCS_URL);
  });

  it('links a page and heading that exist in the hash-routed docs site', () => {
    // docs.attraccess.org is a docsify single-page app: only `/#/<lang>/<page>?id=<heading>` resolves, a path URL is a 404.
    expect(UPGRADE_DOCS_URL).toBe(POSTGRES_CONFIG_DOCS_URL);
    const [, route, id] = /^https:\/\/docs\.attraccess\.org\/#\/en\/(.+)\?id=(.+)$/.exec(UPGRADE_DOCS_URL) ?? [];
    expect(route).toBe('installation/updating');
    const page = readFileSync(join(__dirname, '../../../../../docs/en', `${route}.md`), 'utf8');
    const slugs = [...page.matchAll(/^#{2,4} (.+)$/gm)].map(([, heading]) =>
      heading
        .toLowerCase()
        .replace(/[^a-z0-9 -]/g, '')
        .trim()
        .replace(/ +/g, '-'),
    );
    expect(slugs).toContain(id);
  });

  it('rejects another unsupported type naming the supported values and the docs', () => {
    expect(() => resolveDatabaseBackend({ DATABASE_TYPE: 'mysql' })).toThrow(
      /Unsupported DATABASE_TYPE "mysql"\. Supported values: postgres\./,
    );
    expect(() => resolveDatabaseBackend({ DATABASE_TYPE: 'mysql' })).toThrow(UPGRADE_DOCS_URL);
  });

  it('does not echo a value that looks like a connection string', () => {
    const secret = 'postgres://user:hunter2@host/db';
    try {
      resolveDatabaseBackend({ DATABASE_TYPE: secret });
      throw new Error('expected a throw');
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedDatabaseTypeError);
      expect((error as Error).message).not.toContain('hunter2');
      expect((error as Error).message).toContain('redacted');
    }
  });
});
