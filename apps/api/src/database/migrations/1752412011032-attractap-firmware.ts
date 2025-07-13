import { MigrationInterface, QueryRunner } from 'typeorm';

export class AttractapFirmware1752412011032 implements MigrationInterface {
  name = 'AttractapFirmware1752412011032';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_attractap" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" text NOT NULL, "apiTokenHash" text NOT NULL, "lastConnection" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "firstConnection" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "firmwareName" text, "firmwareVariant" text, "firmwareVersion" text)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_attractap"("id", "name", "apiTokenHash", "lastConnection", "firstConnection") SELECT "id", "name", "apiTokenHash", "lastConnection", "firstConnection" FROM "attractap"`
    );
    await queryRunner.query(`DROP TABLE "attractap"`);
    await queryRunner.query(`ALTER TABLE "temporary_attractap" RENAME TO "attractap"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "attractap" RENAME TO "temporary_attractap"`);
    await queryRunner.query(
      `CREATE TABLE "attractap" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" text NOT NULL, "apiTokenHash" text NOT NULL, "lastConnection" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "firstConnection" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP))`
    );
    await queryRunner.query(
      `INSERT INTO "attractap"("id", "name", "apiTokenHash", "lastConnection", "firstConnection") SELECT "id", "name", "apiTokenHash", "lastConnection", "firstConnection" FROM "temporary_attractap"`
    );
    await queryRunner.query(`DROP TABLE "temporary_attractap"`);
  }
}
