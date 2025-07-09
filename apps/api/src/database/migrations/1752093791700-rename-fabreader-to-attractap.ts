import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameFabreaderToAttractap1752093791700 implements MigrationInterface {
  name = 'RenameFabreaderToAttractap1752093791700';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "attractap" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" text NOT NULL, "apiTokenHash" text NOT NULL, "hasAccessToResourceIds" text NOT NULL DEFAULT (''), "lastConnection" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "firstConnection" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP))`
    );
    // now copy fabreader data to attractap
    await queryRunner.query(
      `INSERT INTO "attractap" ("name", "apiTokenHash", "hasAccessToResourceIds", "lastConnection", "firstConnection") SELECT "name", "apiTokenHash", "hasAccessToResourceIds", "lastConnection", "firstConnection" FROM "fab_reader"`
    );
    // now drop fabreader
    await queryRunner.query(`DROP TABLE "fab_reader"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "fab_reader" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" text NOT NULL, "apiTokenHash" text NOT NULL, "hasAccessToResourceIds" text NOT NULL DEFAULT (''), "lastConnection" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "firstConnection" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP))`
    );
    await queryRunner.query(
      `INSERT INTO "fab_reader" ("name", "apiTokenHash", "hasAccessToResourceIds", "lastConnection", "firstConnection") SELECT "name", "apiTokenHash", "hasAccessToResourceIds", "lastConnection", "firstConnection" FROM "attractap"`
    );
    await queryRunner.query(`DROP TABLE "attractap"`);
  }
}
