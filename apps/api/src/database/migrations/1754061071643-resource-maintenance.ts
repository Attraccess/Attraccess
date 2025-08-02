import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResourceMaintenance1754061071643 implements MigrationInterface {
  name = 'ResourceMaintenance1754061071643';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "resource_maintenance" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "startTime" datetime NOT NULL, "endTime" datetime, "reason" text, "resourceId" integer)`
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_resource_maintenance" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "startTime" datetime NOT NULL, "endTime" datetime, "reason" text, "resourceId" integer, CONSTRAINT "FK_8e0dbf3c8c298697c53d1600bb5" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource_maintenance"("id", "createdAt", "updatedAt", "startTime", "endTime", "reason", "resourceId") SELECT "id", "createdAt", "updatedAt", "startTime", "endTime", "reason", "resourceId" FROM "resource_maintenance"`
    );
    await queryRunner.query(`DROP TABLE "resource_maintenance"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_maintenance" RENAME TO "resource_maintenance"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource_maintenance" RENAME TO "temporary_resource_maintenance"`);
    await queryRunner.query(
      `CREATE TABLE "resource_maintenance" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "startTime" datetime NOT NULL, "endTime" datetime, "reason" text, "resourceId" integer)`
    );
    await queryRunner.query(
      `INSERT INTO "resource_maintenance"("id", "createdAt", "updatedAt", "startTime", "endTime", "reason", "resourceId") SELECT "id", "createdAt", "updatedAt", "startTime", "endTime", "reason", "resourceId" FROM "temporary_resource_maintenance"`
    );
    await queryRunner.query(`DROP TABLE "temporary_resource_maintenance"`);
    await queryRunner.query(`DROP TABLE "resource_maintenance"`);
  }
}
