import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds new enum value 'billing-transaction-summary' to email_templates CHECK by recreating the table
export class EmailTemplatesAddBillingSummary1759800000000 implements MigrationInterface {
  name = 'EmailTemplatesAddBillingSummary1759800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_email_templates" (
        "type" varchar CHECK( "type" IN ('verify-email','reset-password','username-changed','password-changed','resource-usage-billing-transaction-summary') ) PRIMARY KEY NOT NULL,
        "subject" varchar(255) NOT NULL,
        "body" text NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "variables" text NOT NULL
      )`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_email_templates"("type", "subject", "body", "createdAt", "updatedAt", "variables")
       SELECT "type", "subject", "body", "createdAt", "updatedAt", "variables" FROM "email_templates"`,
    );
    await queryRunner.query(`DROP TABLE "email_templates"`);
    await queryRunner.query(`ALTER TABLE "temporary_email_templates" RENAME TO "email_templates"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "email_templates" RENAME TO "temporary_email_templates"`);
    await queryRunner.query(
      `CREATE TABLE "email_templates" (
        "type" varchar CHECK( "type" IN ('verify-email','reset-password','username-changed','password-changed') ) PRIMARY KEY NOT NULL,
        "subject" varchar(255) NOT NULL,
        "body" text NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "variables" text NOT NULL
      )`,
    );
    await queryRunner.query(
      `INSERT INTO "email_templates"("type", "subject", "body", "createdAt", "updatedAt", "variables")
       SELECT "type", "subject", "body", "createdAt", "updatedAt", "variables" FROM "temporary_email_templates" WHERE "type" IN ('verify-email','reset-password','username-changed','password-changed')`,
    );
    await queryRunner.query(`DROP TABLE "temporary_email_templates"`);
  }
}
