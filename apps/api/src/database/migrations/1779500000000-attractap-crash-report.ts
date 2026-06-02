import { MigrationInterface, QueryRunner } from 'typeorm';

export class AttractapCrashReport1779500000000 implements MigrationInterface {
  name = 'AttractapCrashReport1779500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "attractap_crash_report" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "attractapId" integer NOT NULL,
        "resetReason" text NOT NULL,
        "heapFreeBytes" integer,
        "largestFreeBlockBytes" integer,
        "uptimeBeforeResetMs" integer,
        "wsState" text,
        "wifiState" text,
        "firmwareVersion" text,
        "coredumpSize" integer,
        "coredump" blob,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_attractap_crash_report_attractap" FOREIGN KEY ("attractapId") REFERENCES "attractap" ("id") ON DELETE CASCADE
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_attractap_crash_report_attractap_created" ON "attractap_crash_report" ("attractapId", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_attractap_crash_report_attractap_created"`);
    await queryRunner.query(`DROP TABLE "attractap_crash_report"`);
  }
}
