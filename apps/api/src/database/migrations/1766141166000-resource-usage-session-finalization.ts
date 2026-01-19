import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResourceUsageSessionFinalization1766141166000 implements MigrationInterface {
  name = 'ResourceUsageSessionFinalization1766141166000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource_usage" ADD "isFinalized" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`UPDATE "resource_usage" SET "isFinalized" = true`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource_usage" RENAME TO "temporary_resource_usage"`);
    await queryRunner.query(`CREATE TABLE "resource_usage" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "userId" integer, "startTime" datetime NOT NULL DEFAULT (datetime('now')), "startNotes" text, "endTime" datetime, "endNotes" text, "usageInMinutes" integer NOT NULL AS (CASE 
      WHEN "endTime" IS NULL THEN -1
      ELSE (julianday("endTime") - julianday("startTime")) * 1440
    END) STORED, "usageAction" varchar CHECK( "usageAction" IN ('usage','door.lock','door.unlock','door.unlatch') ) NOT NULL, "projectId" integer, CONSTRAINT "FK_2f4b0bc57bf05dd031831965d43" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_8177b2b424a6d31c533d57b95cc" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_6f80e3fc0cf8bfce60e25a6805f" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
    await queryRunner.query(
      `INSERT INTO "resource_usage"("id", "resourceId", "userId", "startTime", "startNotes", "endTime", "endNotes", "usageAction", "projectId") SELECT "id", "resourceId", "userId", "startTime", "startNotes", "endTime", "endNotes", "usageAction", "projectId" FROM "temporary_resource_usage"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_resource_usage"`);
  }
}
