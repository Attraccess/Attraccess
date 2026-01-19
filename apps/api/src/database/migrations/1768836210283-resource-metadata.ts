import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResourceMetadata1768836210283 implements MigrationInterface {
  name = 'ResourceMetadata1768836210283';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource" ADD COLUMN "metadata" json`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource" RENAME TO "temporary_resource"`);
    await queryRunner.query(
      `CREATE TABLE "resource" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" text NOT NULL, "description" text, "imageFilename" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "documentationType" text, "documentationMarkdown" text, "documentationUrl" text, "allowTakeOver" boolean NOT NULL DEFAULT (0), "type" varchar CHECK( "type" IN ('machine','door') ) NOT NULL, "separateUnlockAndUnlatch" boolean NOT NULL DEFAULT (0), "deletedAt" datetime)`,
    );
    await queryRunner.query(
      `INSERT INTO "resource"("id", "name", "description", "imageFilename", "createdAt", "updatedAt", "documentationType", "documentationMarkdown", "documentationUrl", "allowTakeOver", "type", "separateUnlockAndUnlatch", "deletedAt") SELECT "id", "name", "description", "imageFilename", "createdAt", "updatedAt", "documentationType", "documentationMarkdown", "documentationUrl", "allowTakeOver", "type", "separateUnlockAndUnlatch", "deletedAt" FROM "temporary_resource"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_resource"`);
  }
}
