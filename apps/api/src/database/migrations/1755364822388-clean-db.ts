import { MigrationInterface, QueryRunner } from 'typeorm';

export class CleanDb1755364822388 implements MigrationInterface {
  name = 'CleanDb1755364822388';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_resource_maintenance" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "startTime" datetime NOT NULL, "endTime" datetime, "reason" text, "resourceId" integer, CONSTRAINT "FK_8e0dbf3c8c298697c53d1600bb5" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource_maintenance"("id", "createdAt", "updatedAt", "startTime", "endTime", "reason", "resourceId") SELECT "id", "createdAt", "updatedAt", "startTime", "endTime", "reason", "resourceId" FROM "resource_maintenance"`
    );
    await queryRunner.query(`DROP TABLE "resource_maintenance"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_maintenance" RENAME TO "resource_maintenance"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_email_templates" ("type" varchar CHECK( "type" IN ('verify-email','reset-password','username-changed','password-changed','change-email') ) PRIMARY KEY NOT NULL, "subject" varchar(255) NOT NULL, "body" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "variables" text NOT NULL)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_email_templates"("type", "subject", "body", "createdAt", "updatedAt", "variables") SELECT "type", "subject", "body", "createdAt", "updatedAt", "variables" FROM "email_templates"`
    );
    await queryRunner.query(`DROP TABLE "email_templates"`);
    await queryRunner.query(`ALTER TABLE "temporary_email_templates" RENAME TO "email_templates"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_resource_maintenance" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "startTime" datetime NOT NULL, "endTime" datetime, "reason" text, "resourceId" integer)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource_maintenance"("id", "createdAt", "updatedAt", "startTime", "endTime", "reason", "resourceId") SELECT "id", "createdAt", "updatedAt", "startTime", "endTime", "reason", "resourceId" FROM "resource_maintenance"`
    );
    await queryRunner.query(`DROP TABLE "resource_maintenance"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_maintenance" RENAME TO "resource_maintenance"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_resource_maintenance" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "startTime" datetime NOT NULL, "endTime" datetime, "reason" text, "resourceId" integer NOT NULL)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource_maintenance"("id", "createdAt", "updatedAt", "startTime", "endTime", "reason", "resourceId") SELECT "id", "createdAt", "updatedAt", "startTime", "endTime", "reason", "resourceId" FROM "resource_maintenance"`
    );
    await queryRunner.query(`DROP TABLE "resource_maintenance"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_maintenance" RENAME TO "resource_maintenance"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_resource_maintenance" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "startTime" datetime NOT NULL, "endTime" datetime, "reason" text, "resourceId" integer NOT NULL, CONSTRAINT "FK_8e0dbf3c8c298697c53d1600bb5" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`
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
      `CREATE TABLE "resource_maintenance" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "startTime" datetime NOT NULL, "endTime" datetime, "reason" text, "resourceId" integer NOT NULL)`
    );
    await queryRunner.query(
      `INSERT INTO "resource_maintenance"("id", "createdAt", "updatedAt", "startTime", "endTime", "reason", "resourceId") SELECT "id", "createdAt", "updatedAt", "startTime", "endTime", "reason", "resourceId" FROM "temporary_resource_maintenance"`
    );
    await queryRunner.query(`DROP TABLE "temporary_resource_maintenance"`);
    await queryRunner.query(`ALTER TABLE "resource_maintenance" RENAME TO "temporary_resource_maintenance"`);
    await queryRunner.query(
      `CREATE TABLE "resource_maintenance" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "startTime" datetime NOT NULL, "endTime" datetime, "reason" text, "resourceId" integer)`
    );
    await queryRunner.query(
      `INSERT INTO "resource_maintenance"("id", "createdAt", "updatedAt", "startTime", "endTime", "reason", "resourceId") SELECT "id", "createdAt", "updatedAt", "startTime", "endTime", "reason", "resourceId" FROM "temporary_resource_maintenance"`
    );
    await queryRunner.query(`DROP TABLE "temporary_resource_maintenance"`);
    await queryRunner.query(`ALTER TABLE "resource_maintenance" RENAME TO "temporary_resource_maintenance"`);
    await queryRunner.query(
      `CREATE TABLE "resource_maintenance" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "startTime" datetime NOT NULL, "endTime" datetime, "reason" text, "resourceId" integer, CONSTRAINT "FK_8e0dbf3c8c298697c53d1600bb5" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "resource_maintenance"("id", "createdAt", "updatedAt", "startTime", "endTime", "reason", "resourceId") SELECT "id", "createdAt", "updatedAt", "startTime", "endTime", "reason", "resourceId" FROM "temporary_resource_maintenance"`
    );
    await queryRunner.query(`DROP TABLE "temporary_resource_maintenance"`);
    await queryRunner.query(`ALTER TABLE "email_templates" RENAME TO "temporary_email_templates"`);
    await queryRunner.query(
      `CREATE TABLE "email_templates" ("type" varchar CHECK( "type" IN ('verify-email','reset-password','username-changed','password-changed','change-email') ) PRIMARY KEY NOT NULL, "subject" varchar(255) NOT NULL, "body" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "variables" text NOT NULL)`
    );
    await queryRunner.query(
      `INSERT INTO "email_templates"("type", "subject", "body", "createdAt", "updatedAt", "variables") SELECT "type", "subject", "body", "createdAt", "updatedAt", "variables" FROM "temporary_email_templates"`
    );
    await queryRunner.query(`DROP TABLE "temporary_email_templates"`);
    await queryRunner.query(`ALTER TABLE "resource_maintenance" RENAME TO "temporary_resource_maintenance"`);
    await queryRunner.query(
      `CREATE TABLE "resource_maintenance" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "startTime" datetime NOT NULL, "endTime" datetime, "reason" text, "resourceId" integer, CONSTRAINT "FK_8e0dbf3c8c298697c53d1600bb5" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "resource_maintenance"("id", "createdAt", "updatedAt", "startTime", "endTime", "reason", "resourceId") SELECT "id", "createdAt", "updatedAt", "startTime", "endTime", "reason", "resourceId" FROM "temporary_resource_maintenance"`
    );
    await queryRunner.query(`DROP TABLE "temporary_resource_maintenance"`);
  }
}
