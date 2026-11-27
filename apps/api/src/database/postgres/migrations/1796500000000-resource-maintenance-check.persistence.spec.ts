import type { DataSource } from 'typeorm';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { postgresMigrations } from './index';
import { ResourceMaintenanceCheck1796500000000 } from './1796500000000-resource-maintenance-check';

jest.setTimeout(120_000);

describe('ResourceMaintenanceCheck1796500000000 (persistence)', () => {
  let source: DataSource;

  beforeEach(async () => {
    source = await createTestDataSource({ migrations: postgresMigrations, migrationsRun: true });
  });
  afterEach(() => closeTestDataSource(source));

  const run = async (direction: 'up' | 'down') => {
    const runner = source.createQueryRunner();
    try {
      await new ResourceMaintenanceCheck1796500000000()[direction](runner);
    } finally {
      await runner.release();
    }
  };
  const insert = (name: string) => source.query(`INSERT INTO "resource" (name, type) VALUES ($1, 'machine')`, [name]);
  const settings = () =>
    source.query(`SELECT name, "askMaintenanceCheckOnSessionEnd" AS ask FROM "resource" ORDER BY name`);

  it('asks on every resource that exists before the upgrade', async () => {
    await run('down');
    await insert('laser');
    await insert('mill');

    await run('up');

    expect(await settings()).toEqual([
      { name: 'laser', ask: true },
      { name: 'mill', ask: true },
    ]);
  });

  it('asks on new resources by default and cannot be empty', async () => {
    await insert('lathe');

    expect(await settings()).toEqual([{ name: 'lathe', ask: true }]);
    await expect(source.query(`UPDATE "resource" SET "askMaintenanceCheckOnSessionEnd" = NULL`)).rejects.toThrow(
      /null value/,
    );
  });
});
