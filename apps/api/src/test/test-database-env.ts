import { createTestDatabaseLocation, type TestDatabaseLocation } from '../test-utils/test-database';

/**
 * A private PostgreSQL database for a spec that boots the application (AppModule, a child process): `DATABASE_URL`
 * points at a fresh copy of the migrated template while the spec runs, and the database is dropped afterwards.
 */
export function createTestDatabaseEnv() {
  let database: TestDatabaseLocation | undefined;
  let previous: string | undefined;
  return {
    /** Creates the database and points DATABASE_URL (and DATABASE_TYPE) at it. */
    async setup(options: { empty?: boolean } = {}): Promise<string> {
      database = await createTestDatabaseLocation(options);
      previous = process.env.DATABASE_URL;
      process.env.DATABASE_URL = database.location;
      process.env.DATABASE_TYPE = 'postgres';
      return database.location;
    },
    async teardown(): Promise<void> {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
      await database?.remove();
      database = undefined;
    },
  };
}
