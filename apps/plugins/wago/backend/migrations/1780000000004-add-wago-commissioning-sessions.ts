import { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';

export class AddWagoCommissioningSessions1780000000004 implements MigrationInterface {
  name = 'AddWagoCommissioningSessions1780000000004';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "plugin_wago_commissioning_sessions" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "hardware_id" varchar NOT NULL,
      "mqtt_server_id" integer NOT NULL, "target_host" varchar NOT NULL,
      "host_key_fingerprint" varchar NOT NULL, "firmware_baseline" varchar NOT NULL,
      "state" varchar NOT NULL, "enrollment_expires_at" varchar, "enrollment_id" integer, "pairing_code" varchar, "codesys_state" varchar,
      "audit_log" varchar NOT NULL, "failure_reason" varchar,
      "created_at" varchar NOT NULL, "updated_at" varchar NOT NULL
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "plugin_wago_commissioning_sessions"');
  }
}
