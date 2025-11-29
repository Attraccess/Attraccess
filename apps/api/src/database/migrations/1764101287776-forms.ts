import { MigrationInterface, QueryRunner } from 'typeorm';

export class Forms1764101287776 implements MigrationInterface {
  name = 'Forms1764101287776';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "form" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "name" text NOT NULL, "isRequiredOnResourceUsageStart" boolean NOT NULL DEFAULT (0), "isRequiredOnResourceUsageTakeOver" boolean NOT NULL DEFAULT (0), "isRequiredOnResourceUsageEnd" boolean NOT NULL DEFAULT (0), "resourceId" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE TABLE "form_field" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "formId" integer NOT NULL, "name" text NOT NULL, "type" varchar CHECK( "type" IN ('text','number','datetime','boolean') ) NOT NULL, "isRequired" boolean NOT NULL DEFAULT (0), "description" text, "options" json)`,
    );
    await queryRunner.query(
      `CREATE TABLE "form_submission" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "formId" integer NOT NULL, "data" json NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_form" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "name" text NOT NULL, "isRequiredOnResourceUsageStart" boolean NOT NULL DEFAULT (0), "isRequiredOnResourceUsageTakeOver" boolean NOT NULL DEFAULT (0), "isRequiredOnResourceUsageEnd" boolean NOT NULL DEFAULT (0), "resourceId" integer NOT NULL, CONSTRAINT "FK_76fac0083b8fb96455950cb6bb5" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_form"("id", "createdAt", "updatedAt", "name", "isRequiredOnResourceUsageStart", "isRequiredOnResourceUsageTakeOver", "isRequiredOnResourceUsageEnd", "resourceId") SELECT "id", "createdAt", "updatedAt", "name", "isRequiredOnResourceUsageStart", "isRequiredOnResourceUsageTakeOver", "isRequiredOnResourceUsageEnd", "resourceId" FROM "form"`,
    );
    await queryRunner.query(`DROP TABLE "form"`);
    await queryRunner.query(`ALTER TABLE "temporary_form" RENAME TO "form"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_form_field" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "formId" integer NOT NULL, "name" text NOT NULL, "type" varchar CHECK( "type" IN ('text','number','datetime','boolean') ) NOT NULL, "isRequired" boolean NOT NULL DEFAULT (0), "description" text, "options" json, CONSTRAINT "FK_2d83d8a334dd66445db13f92b77" FOREIGN KEY ("formId") REFERENCES "form" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_form_field"("id", "formId", "name", "type", "isRequired", "description", "options") SELECT "id", "formId", "name", "type", "isRequired", "description", "options" FROM "form_field"`,
    );
    await queryRunner.query(`DROP TABLE "form_field"`);
    await queryRunner.query(`ALTER TABLE "temporary_form_field" RENAME TO "form_field"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_form_submission" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "formId" integer NOT NULL, "data" json NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" integer NOT NULL, CONSTRAINT "FK_0c044839ddb8d7bef1c8762a3ce" FOREIGN KEY ("formId") REFERENCES "form" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_df8fce71531e6d42f58b1b5470e" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_form_submission"("id", "formId", "data", "createdAt", "updatedAt", "userId") SELECT "id", "formId", "data", "createdAt", "updatedAt", "userId" FROM "form_submission"`,
    );
    await queryRunner.query(`DROP TABLE "form_submission"`);
    await queryRunner.query(`ALTER TABLE "temporary_form_submission" RENAME TO "form_submission"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "form_submission" RENAME TO "temporary_form_submission"`);
    await queryRunner.query(
      `CREATE TABLE "form_submission" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "formId" integer NOT NULL, "data" json NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" integer NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "form_submission"("id", "formId", "data", "createdAt", "updatedAt", "userId") SELECT "id", "formId", "data", "createdAt", "updatedAt", "userId" FROM "temporary_form_submission"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_form_submission"`);
    await queryRunner.query(`ALTER TABLE "form_field" RENAME TO "temporary_form_field"`);
    await queryRunner.query(
      `CREATE TABLE "form_field" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "formId" integer NOT NULL, "name" text NOT NULL, "type" varchar CHECK( "type" IN ('text','number','datetime','boolean') ) NOT NULL, "isRequired" boolean NOT NULL DEFAULT (0), "description" text, "options" json)`,
    );
    await queryRunner.query(
      `INSERT INTO "form_field"("id", "formId", "name", "type", "isRequired", "description", "options") SELECT "id", "formId", "name", "type", "isRequired", "description", "options" FROM "temporary_form_field"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_form_field"`);
    await queryRunner.query(`ALTER TABLE "form" RENAME TO "temporary_form"`);
    await queryRunner.query(
      `CREATE TABLE "form" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "name" text NOT NULL, "isRequiredOnResourceUsageStart" boolean NOT NULL DEFAULT (0), "isRequiredOnResourceUsageTakeOver" boolean NOT NULL DEFAULT (0), "isRequiredOnResourceUsageEnd" boolean NOT NULL DEFAULT (0), "resourceId" integer NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "form"("id", "createdAt", "updatedAt", "name", "isRequiredOnResourceUsageStart", "isRequiredOnResourceUsageTakeOver", "isRequiredOnResourceUsageEnd", "resourceId") SELECT "id", "createdAt", "updatedAt", "name", "isRequiredOnResourceUsageStart", "isRequiredOnResourceUsageTakeOver", "isRequiredOnResourceUsageEnd", "resourceId" FROM "temporary_form"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_form"`);
    await queryRunner.query(`DROP TABLE "form_submission"`);
    await queryRunner.query(`DROP TABLE "form_field"`);
    await queryRunner.query(`DROP TABLE "form"`);
  }
}
