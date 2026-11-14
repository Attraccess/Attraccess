import { DataSource } from 'typeorm';
import { SharedMachineBilling1792900000000 } from './1792900000000-shared-machine-billing';

describe('SharedMachineBilling migration', () => {
  async function withDatabase(test: (runner: ReturnType<DataSource['createQueryRunner']>) => Promise<void>) {
    const database = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
    const runner = database.createQueryRunner();
    try {
      await runner.query(`CREATE TABLE "resource" (id integer PRIMARY KEY)`);
      await runner.query(
        `CREATE TABLE "resource_meter" (id integer PRIMARY KEY, resourceId integer NOT NULL, name varchar NOT NULL)`,
      );
      await runner.query(`CREATE TABLE "resource_metering_session" (id varchar PRIMARY KEY, meterId integer)`);
      await runner.query(`CREATE TABLE "billing_transaction_item" (id integer PRIMARY KEY, name varchar)`);
      await runner.query(`INSERT INTO "resource" (id) VALUES (1)`);
      await runner.query(`INSERT INTO "resource_meter" (id, resourceId, name) VALUES (1, 1, 'Energy'), (2, 1, 'Air')`);
      await runner.query(`INSERT INTO "resource_metering_session" (id, meterId) VALUES ('s1', 1)`);
      await test(runner);
    } finally {
      await runner.release();
      await database.destroy();
    }
  }

  it('sets the shared allocation on every existing meter and keeps existing sessions on their own total', async () => {
    await withDatabase(async (runner) => {
      await new SharedMachineBilling1792900000000().up(runner);

      expect(await runner.query(`SELECT id, allocation FROM "resource_meter" ORDER BY id`)).toEqual([
        { id: 1, allocation: 'shared' },
        { id: 2, allocation: 'shared' },
      ]);
      expect(await runner.query(`SELECT accounting FROM "resource_metering_session"`)).toEqual([{ accounting: 'own' }]);
      await runner.query(
        `INSERT INTO "resource_metering_segment" (id, resourceId, meterId, status, startedAt, startValue, participants)
         VALUES ('a', 1, 1, 'open', '2026-01-01', '0', '[]')`,
      );
      expect(await runner.query(`SELECT status FROM "resource_metering_segment"`)).toEqual([{ status: 'open' }]);
    });
  });

  it('can run twice and be reverted', async () => {
    await withDatabase(async (runner) => {
      const migration = new SharedMachineBilling1792900000000();
      await migration.up(runner);
      await migration.up(runner);
      await migration.down(runner);
      await migration.down(runner);

      expect(await runner.query(`SELECT * FROM "resource_meter" ORDER BY id`)).toEqual([
        { id: 1, resourceId: 1, name: 'Energy' },
        { id: 2, resourceId: 1, name: 'Air' },
      ]);
      expect(await runner.query(`SELECT name FROM sqlite_master WHERE name = 'resource_metering_segment'`)).toEqual([]);
    });
  });
});
