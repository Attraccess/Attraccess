import { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';

export class AddWagoConfigurationRevisions1780000000002 implements MigrationInterface {
  name = 'AddWagoConfigurationRevisions1780000000002';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "plugin_wago_settings" ADD COLUMN "operational_prefix" varchar NOT NULL DEFAULT (\'attraccess/wago\')',
    );
    await queryRunner.query(`CREATE TABLE "plugin_wago_configuration_drafts" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "controller_id" integer NOT NULL,
      "snapshot" text NOT NULL, "reviewed_hash" varchar, "updated_at" varchar NOT NULL,
      CONSTRAINT "UQ_plugin_wago_configuration_drafts_controller_id" UNIQUE ("controller_id"))`);
    await queryRunner.query(`CREATE TABLE "plugin_wago_configuration_revisions" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "controller_id" integer NOT NULL,
      "revision" integer NOT NULL, "snapshot" text NOT NULL, "content_hash" varchar NOT NULL,
      "state" varchar NOT NULL, "rejection_errors" text, "published_at" varchar NOT NULL, "reported_at" varchar,
      CONSTRAINT "UQ_plugin_wago_configuration_revisions_controller_revision" UNIQUE ("controller_id", "revision"))`);
    await queryRunner.query(
      'CREATE INDEX "IDX_plugin_wago_configuration_revisions_controller" ON "plugin_wago_configuration_revisions" ("controller_id", "revision")',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_plugin_wago_configuration_revisions_controller"');
    await queryRunner.query('DROP TABLE "plugin_wago_configuration_revisions"');
    await queryRunner.query('DROP TABLE "plugin_wago_configuration_drafts"');
    await queryRunner.query('ALTER TABLE "plugin_wago_settings" DROP COLUMN "operational_prefix"');
  }
}
