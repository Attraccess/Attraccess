import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReaderUiSettings1792000000000 implements MigrationInterface {
  name = 'ReaderUiSettings1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "reader_ui_resource_settings" ("resourceId" integer PRIMARY KEY NOT NULL, "noScreenPolicy" text)`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "reader_ui_plugin_settings" ("resourceId" integer NOT NULL, "plugin" text NOT NULL, "widgetsEnabled" boolean NOT NULL DEFAULT (1), "hookFailurePolicy" text NOT NULL DEFAULT ('fail-closed'), PRIMARY KEY ("resourceId", "plugin"))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "reader_ui_reader_settings" ("readerId" integer PRIMARY KEY NOT NULL, "widgetsEnabled" boolean NOT NULL DEFAULT (1))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "reader_ui_alert" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "kind" text NOT NULL, "plugin" text, "readerId" integer, "message" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "clearedAt" datetime, "clearedByUserId" integer)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "reader_ui_alert"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reader_ui_reader_settings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reader_ui_plugin_settings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reader_ui_resource_settings"`);
  }
}
