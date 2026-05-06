// Migration up/down/up smoke test for introduction schedules
// FEATURE: User retraining requirement (ATT-106)
import { DataSource } from 'typeorm';
import { IntroductionSchedules1778016390000 } from '../1778016390000-introduction-schedules';

describe('Migration: introduction-schedules', () => {
  let ds: DataSource;

  beforeEach(async () => {
    ds = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      synchronize: false,
    });
    await ds.initialize();

    await ds.query(
      `CREATE TABLE "user" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "username" varchar NOT NULL, "email" varchar NOT NULL)`,
    );
    await ds.query(
      `CREATE TABLE "resource" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar NOT NULL, "type" varchar NOT NULL)`,
    );
    await ds.query(
      `CREATE TABLE "resource_group" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar NOT NULL)`,
    );
    await ds.query(
      `CREATE TABLE "resource_introduction" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "receiverUserId" integer NOT NULL)`,
    );
    await ds.query(
      `CREATE TABLE "resource_introduction_history_item" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "introductionId" integer NOT NULL,
        "action" varchar CHECK("action" IN ('revoke','grant')) NOT NULL,
        "performedByUserId" integer NOT NULL,
        "comment" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_rihi_intro" FOREIGN KEY ("introductionId") REFERENCES "resource_introduction" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_rihi_user" FOREIGN KEY ("performedByUserId") REFERENCES "user" ("id")
      )`,
    );
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('runs up, down, up without error and preserves rows', async () => {
    const migration = new IntroductionSchedules1778016390000();
    const runner = ds.createQueryRunner();

    await runner.query(`INSERT INTO "user" ("username", "email") VALUES ('u1', 'u1@example.com')`);
    await runner.query(`INSERT INTO "resource" ("name", "type") VALUES ('R1', 'MACHINE')`);
    await runner.query(
      `INSERT INTO "resource_introduction" ("resourceId", "receiverUserId") VALUES (1, 1)`,
    );
    await runner.query(
      `INSERT INTO "resource_introduction_history_item" ("introductionId", "action", "performedByUserId", "comment") VALUES (1, 'grant', 1, 'seed')`,
    );

    await migration.up(runner);

    const tablesAfterUp = await runner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'resource_introduction_schedule%' ORDER BY name`,
    );
    expect(tablesAfterUp.length).toBe(3);

    const historyAfterUp = await runner.query(
      `SELECT id, action, "performedByUserId", "scheduleId" FROM "resource_introduction_history_item"`,
    );
    expect(historyAfterUp.length).toBe(1);
    expect(historyAfterUp[0].action).toBe('grant');
    expect(historyAfterUp[0].scheduleId).toBeNull();

    await migration.down(runner);

    const tablesAfterDown = await runner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'resource_introduction_schedule%'`,
    );
    expect(tablesAfterDown.length).toBe(0);

    const historyAfterDown = await runner.query(
      `SELECT id, action, "performedByUserId" FROM "resource_introduction_history_item"`,
    );
    expect(historyAfterDown.length).toBe(1);
    expect(historyAfterDown[0].action).toBe('grant');

    await migration.up(runner);

    const tablesAfterUp2 = await runner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'resource_introduction_schedule%'`,
    );
    expect(tablesAfterUp2.length).toBe(3);

    await runner.release();
  });
});
