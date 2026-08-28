import { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';

export class CreateWagoControllers1780000000000 implements MigrationInterface {
  name = 'CreateWagoControllers1780000000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "plugin_wago_controllers" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "hardware_id" varchar NOT NULL,
      "trust_state" varchar NOT NULL, "name" varchar, "mqtt_server_id" integer, "enrollment_id" integer,
      "pairing_code_hash" varchar NOT NULL, "fingerprint" varchar,
      "protocol_version" varchar NOT NULL, "runtime_version" varchar NOT NULL,
      "capabilities" varchar NOT NULL, "last_sequence" integer NOT NULL DEFAULT (0),
      "last_heartbeat_at" varchar, "last_seen_at" varchar NOT NULL,
      "compatibility_error" varchar, "created_at" varchar NOT NULL, "updated_at" varchar NOT NULL,
      CONSTRAINT "UQ_plugin_wago_controllers_hardware_id" UNIQUE ("hardware_id"))`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "plugin_wago_settings" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "default_mqtt_server_id" integer)`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "plugin_wago_enrollments" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "mqtt_server_id" integer NOT NULL, "hardware_id" varchar NOT NULL,
      "secret_hash" varchar NOT NULL, "identity" varchar NOT NULL, "created_at" varchar NOT NULL,
      "expires_at" varchar NOT NULL, "consumed_at" varchar, CONSTRAINT "UQ_plugin_wago_enrollments_secret_hash" UNIQUE ("secret_hash"))`);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_plugin_wago_enrollments_active" ON "plugin_wago_enrollments" ("consumed_at", "expires_at")',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_plugin_wago_enrollments_active"');
    await queryRunner.query('DROP TABLE "plugin_wago_enrollments"');
    await queryRunner.query('DROP TABLE "plugin_wago_settings"');
    await queryRunner.query('DROP TABLE "plugin_wago_controllers"');
  }
}
