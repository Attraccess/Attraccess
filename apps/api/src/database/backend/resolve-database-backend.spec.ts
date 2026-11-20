import { resolveDatabaseBackend, UnsupportedDatabaseTypeError } from './resolve-database-backend';

describe('database backend selection', () => {
  it('defaults to sqlite and accepts it explicitly', () => {
    expect(resolveDatabaseBackend({}).type).toBe('sqlite');
    expect(resolveDatabaseBackend({ DATABASE_TYPE: ' SQLite ' }).type).toBe('sqlite');
  });

  it('exposes the released sqlite migration track with the unchanged migrations table', () => {
    const track = resolveDatabaseBackend({}).migrationTrack;
    expect(track.tableName).toBe('migrations');
    expect(track.migrations.length).toBeGreaterThanOrEqual(204);
  });

  it('rejects an unsupported type before touching a database, naming the supported values', () => {
    expect(() => resolveDatabaseBackend({ DATABASE_TYPE: 'postgres' })).toThrow(UnsupportedDatabaseTypeError);
    expect(() => resolveDatabaseBackend({ DATABASE_TYPE: 'postgres' })).toThrow(/Supported values: sqlite/);
  });

  it('does not echo a value that looks like a connection string', () => {
    const secret = 'postgres://user:hunter2@host/db';
    try {
      resolveDatabaseBackend({ DATABASE_TYPE: secret });
      throw new Error('expected a throw');
    } catch (error) {
      expect((error as Error).message).not.toContain('hunter2');
      expect((error as Error).message).toContain('redacted');
    }
  });
});
