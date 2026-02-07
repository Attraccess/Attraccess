import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Maintenance schedules: new schedule table, three config tables (usage hours,
 * usage count, time interval), and audit/schedule columns on resource_maintenance.
 * Trigger types: USAGE_HOURS, USAGE_COUNT, TIME_INTERVAL only (no FLOW_NODE, no triggerConfig).
 */
export class MaintenanceSchedules1770485229439 implements MigrationInterface {
  name = 'MaintenanceSchedules1770485229439';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create resource_maintenance_schedule (no triggerConfig, no FLOW_NODE)
    await queryRunner.query(
      `CREATE TABLE "resource_maintenance_schedule" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "resourceId" integer NOT NULL,
        "name" text,
        "triggerType" varchar CHECK("triggerType" IN ('USAGE_HOURS', 'USAGE_COUNT', 'TIME_INTERVAL')) NOT NULL,
        "enabled" boolean NOT NULL DEFAULT (1),
        CONSTRAINT "FK_resource_maintenance_schedule_resource" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )`
    );

    // 2. Create config tables (1:1 per trigger type)
    await queryRunner.query(
      `CREATE TABLE "resource_maintenance_schedule_usage_hours_config" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "scheduleId" integer NOT NULL,
        "thresholdMinutes" integer NOT NULL,
        CONSTRAINT "UQ_usage_hours_scheduleId" UNIQUE ("scheduleId"),
        CONSTRAINT "FK_usage_hours_schedule" FOREIGN KEY ("scheduleId") REFERENCES "resource_maintenance_schedule" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )`
    );
    await queryRunner.query(
      `CREATE TABLE "resource_maintenance_schedule_usage_count_config" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "scheduleId" integer NOT NULL,
        "thresholdSessions" integer NOT NULL,
        CONSTRAINT "UQ_usage_count_scheduleId" UNIQUE ("scheduleId"),
        CONSTRAINT "FK_usage_count_schedule" FOREIGN KEY ("scheduleId") REFERENCES "resource_maintenance_schedule" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )`
    );
    await queryRunner.query(
      `CREATE TABLE "resource_maintenance_schedule_time_interval_config" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "scheduleId" integer NOT NULL,
        "intervalDays" integer,
        "thresholdHours" real,
        CONSTRAINT "UQ_time_interval_scheduleId" UNIQUE ("scheduleId"),
        CONSTRAINT "FK_time_interval_schedule" FOREIGN KEY ("scheduleId") REFERENCES "resource_maintenance_schedule" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )`
    );

    // 3. Extend resource_maintenance: add createdByUserId, completedByUserId, completedAt, maintenanceScheduleId (SQLite: recreate table)
    await queryRunner.query(
      `CREATE TABLE "temporary_resource_maintenance" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "startTime" datetime NOT NULL,
        "endTime" datetime,
        "reason" text,
        "resourceId" integer NOT NULL,
        "createdByUserId" integer,
        "completedByUserId" integer,
        "completedAt" datetime,
        "maintenanceScheduleId" integer,
        CONSTRAINT "FK_8e0dbf3c8c298697c53d1600bb5" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_resource_maintenance_createdByUser" FOREIGN KEY ("createdByUserId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_resource_maintenance_completedByUser" FOREIGN KEY ("completedByUserId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_resource_maintenance_schedule" FOREIGN KEY ("maintenanceScheduleId") REFERENCES "resource_maintenance_schedule" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource_maintenance"("id", "createdAt", "updatedAt", "startTime", "endTime", "reason", "resourceId")
       SELECT "id", "createdAt", "updatedAt", "startTime", "endTime", "reason", "resourceId" FROM "resource_maintenance"`
    );
    await queryRunner.query(`DROP TABLE "resource_maintenance"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_resource_maintenance" RENAME TO "resource_maintenance"`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Revert resource_maintenance (drop new columns)
    await queryRunner.query(
      `ALTER TABLE "resource_maintenance" RENAME TO "temporary_resource_maintenance"`
    );
    await queryRunner.query(
      `CREATE TABLE "resource_maintenance" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "startTime" datetime NOT NULL,
        "endTime" datetime,
        "reason" text,
        "resourceId" integer NOT NULL,
        CONSTRAINT "FK_8e0dbf3c8c298697c53d1600bb5" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )`
    );
    await queryRunner.query(
      `INSERT INTO "resource_maintenance"("id", "createdAt", "updatedAt", "startTime", "endTime", "reason", "resourceId")
       SELECT "id", "createdAt", "updatedAt", "startTime", "endTime", "reason", "resourceId" FROM "temporary_resource_maintenance"`
    );
    await queryRunner.query(`DROP TABLE "temporary_resource_maintenance"`);

    // 2. Drop config tables
    await queryRunner.query(`DROP TABLE "resource_maintenance_schedule_time_interval_config"`);
    await queryRunner.query(`DROP TABLE "resource_maintenance_schedule_usage_count_config"`);
    await queryRunner.query(`DROP TABLE "resource_maintenance_schedule_usage_hours_config"`);

    // 3. Drop schedule table
    await queryRunner.query(`DROP TABLE "resource_maintenance_schedule"`);
  }
}
