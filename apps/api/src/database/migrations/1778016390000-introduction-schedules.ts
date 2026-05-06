import { MigrationInterface, QueryRunner } from 'typeorm';

export class IntroductionSchedules1778016390000 implements MigrationInterface {
  name = 'IntroductionSchedules1778016390000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "resource_introduction_schedule" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "resourceId" integer,
        "resourceGroupId" integer,
        "name" text,
        "triggerType" varchar CHECK("triggerType" IN ('TIME_SINCE_INTRODUCTION','INACTIVITY')) NOT NULL,
        "blockAccess" boolean NOT NULL DEFAULT (0),
        "warnDaysBefore" integer NOT NULL DEFAULT (0),
        "enabled" boolean NOT NULL DEFAULT (1),
        CONSTRAINT "FK_ris_resource" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ris_group" FOREIGN KEY ("resourceGroupId") REFERENCES "resource_group" ("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "IDX_ris_resource" ON "resource_introduction_schedule" ("resourceId")`);
    await q.query(`CREATE INDEX "IDX_ris_group" ON "resource_introduction_schedule" ("resourceGroupId")`);
    await q.query(`CREATE INDEX "IDX_ris_enabled" ON "resource_introduction_schedule" ("enabled")`);

    await q.query(`
      CREATE TABLE "resource_introduction_schedule_time_since_introduction_config" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "scheduleId" integer NOT NULL UNIQUE,
        "duration" integer NOT NULL,
        "unit" varchar CHECK("unit" IN ('DAYS','WEEKS','MONTHS','YEARS')) NOT NULL,
        CONSTRAINT "FK_ristsic_schedule" FOREIGN KEY ("scheduleId") REFERENCES "resource_introduction_schedule" ("id") ON DELETE CASCADE
      )
    `);

    await q.query(`
      CREATE TABLE "resource_introduction_schedule_inactivity_config" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "scheduleId" integer NOT NULL UNIQUE,
        "duration" integer NOT NULL,
        "unit" varchar CHECK("unit" IN ('DAYS','WEEKS','MONTHS','YEARS')) NOT NULL,
        "scope" varchar CHECK("scope" IN ('GROUP','RESOURCE')) NOT NULL,
        CONSTRAINT "FK_risic_schedule" FOREIGN KEY ("scheduleId") REFERENCES "resource_introduction_schedule" ("id") ON DELETE CASCADE
      )
    `);

    await q.query(`
      CREATE TABLE "rihi_tmp" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "introductionId" integer NOT NULL,
        "action" varchar CHECK("action" IN ('revoke','grant','renew','expire','warn_sent')) NOT NULL,
        "performedByUserId" integer,
        "comment" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "scheduleId" integer,
        CONSTRAINT "FK_rihi_intro" FOREIGN KEY ("introductionId") REFERENCES "resource_introduction" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_rihi_user" FOREIGN KEY ("performedByUserId") REFERENCES "user" ("id"),
        CONSTRAINT "FK_rihi_schedule" FOREIGN KEY ("scheduleId") REFERENCES "resource_introduction_schedule" ("id") ON DELETE SET NULL
      )
    `);
    await q.query(`
      INSERT INTO "rihi_tmp" ("id","introductionId","action","performedByUserId","comment","createdAt","scheduleId")
      SELECT "id","introductionId","action","performedByUserId","comment","createdAt", NULL
      FROM "resource_introduction_history_item"
    `);
    await q.query(`DROP TABLE "resource_introduction_history_item"`);
    await q.query(`ALTER TABLE "rihi_tmp" RENAME TO "resource_introduction_history_item"`);
    await q.query(`CREATE INDEX "IDX_rihi_intro" ON "resource_introduction_history_item" ("introductionId")`);
    await q.query(`CREATE INDEX "IDX_rihi_schedule" ON "resource_introduction_history_item" ("scheduleId")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "IDX_rihi_intro"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_rihi_schedule"`);
    await q.query(`
      CREATE TABLE "rihi_tmp" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "introductionId" integer NOT NULL,
        "action" varchar CHECK("action" IN ('revoke','grant')) NOT NULL,
        "performedByUserId" integer NOT NULL,
        "comment" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_rihi_intro" FOREIGN KEY ("introductionId") REFERENCES "resource_introduction" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_rihi_user" FOREIGN KEY ("performedByUserId") REFERENCES "user" ("id")
      )
    `);
    await q.query(`
      INSERT INTO "rihi_tmp" ("id","introductionId","action","performedByUserId","comment","createdAt")
      SELECT "id","introductionId","action","performedByUserId","comment","createdAt"
      FROM "resource_introduction_history_item"
      WHERE "action" IN ('revoke','grant') AND "performedByUserId" IS NOT NULL
    `);
    await q.query(`DROP TABLE "resource_introduction_history_item"`);
    await q.query(`ALTER TABLE "rihi_tmp" RENAME TO "resource_introduction_history_item"`);

    await q.query(`DROP INDEX IF EXISTS "IDX_ris_resource"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_ris_group"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_ris_enabled"`);
    await q.query(`DROP TABLE "resource_introduction_schedule_inactivity_config"`);
    await q.query(`DROP TABLE "resource_introduction_schedule_time_since_introduction_config"`);
    await q.query(`DROP TABLE "resource_introduction_schedule"`);
  }
}
