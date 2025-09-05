import { MigrationInterface, QueryRunner } from 'typeorm';

export class DoorUnlockUnlatch1756931999972 implements MigrationInterface {
  name = 'DoorUnlockUnlatch1756931999972';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_resource" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" text NOT NULL, "description" text, "imageFilename" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "documentationType" text, "documentationMarkdown" text, "documentationUrl" text, "allowTakeOver" boolean NOT NULL DEFAULT (0), "type" varchar CHECK( "type" IN ('machine','door') ) NOT NULL, "separateUnlockAndUnlatch" boolean NOT NULL DEFAULT (0))`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource"("id", "name", "description", "imageFilename", "createdAt", "updatedAt", "documentationType", "documentationMarkdown", "documentationUrl", "allowTakeOver", "type") SELECT "id", "name", "description", "imageFilename", "createdAt", "updatedAt", "documentationType", "documentationMarkdown", "documentationUrl", "allowTakeOver", "type" FROM "resource"`
    );
    await queryRunner.query(`DROP TABLE "resource"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource" RENAME TO "resource"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource" RENAME TO "temporary_resource"`);
    await queryRunner.query(
      `CREATE TABLE "resource" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" text NOT NULL, "description" text, "imageFilename" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "documentationType" text, "documentationMarkdown" text, "documentationUrl" text, "allowTakeOver" boolean NOT NULL DEFAULT (0), "type" varchar CHECK( "type" IN ('machine','door') ) NOT NULL)`
    );
    await queryRunner.query(
      `INSERT INTO "resource"("id", "name", "description", "imageFilename", "createdAt", "updatedAt", "documentationType", "documentationMarkdown", "documentationUrl", "allowTakeOver", "type") SELECT "id", "name", "description", "imageFilename", "createdAt", "updatedAt", "documentationType", "documentationMarkdown", "documentationUrl", "allowTakeOver", "type" FROM "temporary_resource"`
    );
    await queryRunner.query(`DROP TABLE "temporary_resource"`);
  }
}
