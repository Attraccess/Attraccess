import { postgresBackend } from './postgres-backend';

describe('postgresBackend.createDataSourceOptions', () => {
  const original = { skip: process.env.SKIP_DATABASE_MIGRATIONS, url: process.env.DATABASE_URL };

  beforeEach(() => {
    process.env.DATABASE_URL = 'postgres://user:secret@localhost:5432/attraccess';
  });

  afterEach(() => {
    for (const [name, value] of [
      ['SKIP_DATABASE_MIGRATIONS', original.skip],
      ['DATABASE_URL', original.url],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('runs pending migrations when the application connection opens', () => {
    delete process.env.SKIP_DATABASE_MIGRATIONS;

    const options = postgresBackend.createDataSourceOptions();

    expect(options.migrationsRun).toBe(true);
    expect(options.migrationsTransactionMode).toBe('each');
  });

  it('runs no migration with SKIP_DATABASE_MIGRATIONS=true, so a SQLite file is never imported', () => {
    process.env.SKIP_DATABASE_MIGRATIONS = 'true';

    expect(postgresBackend.createDataSourceOptions().migrationsRun).toBe(false);
  });
});
