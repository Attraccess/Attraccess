import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResourceBillingConfiguration1757700785897 implements MigrationInterface {
  name = 'ResourceBillingConfiguration1757700785897';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "resource_billing_configuration" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceId" integer NOT NULL, "creditsPerUsage" integer NOT NULL, "creditsPerMinute" integer NOT NULL, CONSTRAINT "UQ_b26284ac4d8734d088b04a0081b" UNIQUE ("resourceId"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_resource_billing_configuration" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceId" integer NOT NULL, "creditsPerUsage" integer NOT NULL, "creditsPerMinute" integer NOT NULL, CONSTRAINT "UQ_b26284ac4d8734d088b04a0081b" UNIQUE ("resourceId"), CONSTRAINT "FK_b26284ac4d8734d088b04a0081b" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource_billing_configuration"("id", "createdAt", "updatedAt", "resourceId", "creditsPerUsage", "creditsPerMinute") SELECT "id", "createdAt", "updatedAt", "resourceId", "creditsPerUsage", "creditsPerMinute" FROM "resource_billing_configuration"`,
    );
    await queryRunner.query(`DROP TABLE "resource_billing_configuration"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_resource_billing_configuration" RENAME TO "resource_billing_configuration"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "resource_billing_configuration" RENAME TO "temporary_resource_billing_configuration"`,
    );
    await queryRunner.query(
      `CREATE TABLE "resource_billing_configuration" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceId" integer NOT NULL, "creditsPerUsage" integer NOT NULL, "creditsPerMinute" integer NOT NULL, CONSTRAINT "UQ_b26284ac4d8734d088b04a0081b" UNIQUE ("resourceId"))`,
    );
    await queryRunner.query(
      `INSERT INTO "resource_billing_configuration"("id", "createdAt", "updatedAt", "resourceId", "creditsPerUsage", "creditsPerMinute") SELECT "id", "createdAt", "updatedAt", "resourceId", "creditsPerUsage", "creditsPerMinute" FROM "temporary_resource_billing_configuration"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_resource_billing_configuration"`);
    await queryRunner.query(`DROP TABLE "resource_billing_configuration"`);
  }
}
