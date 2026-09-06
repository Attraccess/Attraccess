import type { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';

export class WagoCredentialRotation1780010610000 implements MigrationInterface {
  name = 'WagoCredentialRotation1780010610000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "plugin_wago_credential_rotations" (
      "controller_id" integer PRIMARY KEY NOT NULL REFERENCES "plugin_wago_controllers"("id") ON DELETE CASCADE,
      "revision" integer NOT NULL,
      "phase" varchar NOT NULL,
      "mqtt_server_id" integer NOT NULL,
      "prefix" varchar NOT NULL,
      "token" varchar NOT NULL,
      "encrypted_credentials" text
    )`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query('SELECT COUNT(*) AS count FROM "plugin_wago_credential_rotations"');
    // Completed revisions also prevent a downgraded/reinstalled owner from replaying old credentials.
    if (Number(rows[0].count))
      throw new Error('Remove controller registrations before removing credential rotation history');
    await queryRunner.query('DROP TABLE "plugin_wago_credential_rotations"');
  }
}
