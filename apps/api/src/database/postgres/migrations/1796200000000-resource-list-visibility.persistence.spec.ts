import type { DataSource } from 'typeorm';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { PostgresBaseline1760000000000 } from './1760000000000-baseline';
import { ResourceListVisibility1796200000000 } from './1796200000000-resource-list-visibility';

jest.setTimeout(120_000);

describe('ResourceListVisibility1796200000000 (persistence)', () => {
  let source: DataSource;

  beforeEach(async () => {
    source = await createTestDataSource({ migrations: [PostgresBaseline1760000000000], migrationsRun: true });
  });
  afterEach(() => closeTestDataSource(source));

  const runMigration = async () => {
    const runner = source.createQueryRunner();
    try {
      await new ResourceListVisibility1796200000000().up(runner);
    } finally {
      await runner.release();
    }
  };
  const stored = () =>
    source.query(`SELECT "value" FROM "setting" WHERE "parent" = 'resources' AND "key" = 'list_visibility'`);
  const addUser = () =>
    source.query(`INSERT INTO "user" ("username", "email") VALUES ('member', 'member@example.com')`);

  it('stores nothing on an empty database, so a fresh install gets the restrictive default', async () => {
    await runMigration();
    expect(await stored()).toEqual([]);
  });

  it('stores "authenticated" on an instance that already has accounts', async () => {
    await addUser();
    await runMigration();
    expect(await stored()).toEqual([{ value: 'authenticated' }]);
  });

  it('never overwrites a stored value', async () => {
    await addUser();
    await source.query(
      `INSERT INTO "setting" ("parent", "key", "value") VALUES ('resources', 'list_visibility', 'permitted-only')`,
    );
    await runMigration();
    expect(await stored()).toEqual([{ value: 'permitted-only' }]);
  });
});
