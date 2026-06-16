import { DataSource } from 'typeorm';
import { ResourceHealthSystemSource1781700000000 } from './1781700000000-resource-health-system-source';

const createDataSource = async (): Promise<DataSource> => {
  const dataSource = new DataSource({
    type: 'sqlite',
    database: ':memory:',
  });

  await dataSource.initialize();
  return dataSource;
};

describe('ResourceHealthSystemSource1781700000000', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = await createDataSource();
    await dataSource.query('PRAGMA foreign_keys = OFF');
    await dataSource.query(`CREATE TABLE "resource" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL)`);
    await dataSource.query(`INSERT INTO "resource"("id") VALUES (1)`);
    await dataSource.query(
      `CREATE TABLE "resource_health_state" (` +
        `"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, ` +
        `"resourceId" integer NOT NULL, ` +
        `"identifier" text NOT NULL DEFAULT (''), ` +
        `"status" varchar NOT NULL DEFAULT ('healthy'), ` +
        `"reason" text, ` +
        `"source" varchar CHECK( "source" IN ('payload','heartbeat','manual') ) NOT NULL DEFAULT ('manual'), ` +
        `"lastReportedAt" datetime NOT NULL, ` +
        `"createdAt" datetime NOT NULL DEFAULT (datetime('now')), ` +
        `"updatedAt" datetime NOT NULL DEFAULT (datetime('now')), ` +
        `CONSTRAINT "UQ_resource_health_resource_identifier" UNIQUE ("resourceId", "identifier"), ` +
        `CONSTRAINT "FK_resource_health_state_resource" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await dataSource.query(
      `INSERT INTO "resource_health_state"("resourceId", "identifier", "status", "source", "lastReportedAt") VALUES (1, 'existing', 'unhealthy', 'manual', datetime('now'))`,
    );
  });

  afterEach(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('allows system generated resource health entries on constrained sqlite tables', async () => {
    const migration = new ResourceHealthSystemSource1781700000000();

    await migration.up(dataSource.createQueryRunner());

    await expect(
      dataSource.query(
        `INSERT INTO "resource_health_state"("resourceId", "identifier", "status", "source", "lastReportedAt") VALUES (1, 'mqtt-server-5', 'unhealthy', 'system', datetime('now'))`,
      ),
    ).resolves.toBeDefined();

    const rows = await dataSource.query(`SELECT "identifier", "source" FROM "resource_health_state" ORDER BY "identifier"`);
    expect(rows).toEqual([
      { identifier: 'existing', source: 'manual' },
      { identifier: 'mqtt-server-5', source: 'system' },
    ]);
  });
});
