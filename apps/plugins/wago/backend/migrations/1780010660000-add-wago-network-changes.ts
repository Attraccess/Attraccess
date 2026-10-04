import type { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';

export class WagoNetworkChanges1780010660000 implements MigrationInterface {
  name = 'WagoNetworkChanges1780010660000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE "plugin_wago_network_changes" (
      "controller_id" integer PRIMARY KEY NOT NULL REFERENCES "plugin_wago_controllers"("id") ON DELETE CASCADE,
      "session_id" integer NOT NULL, "fingerprint" varchar NOT NULL, "target_host" varchar NOT NULL,
      "mqtt_server_id" integer, "phase" varchar NOT NULL, "failure" varchar,
      "encrypted_payload" text, "updated_at" varchar NOT NULL
    )`);
    await runner.query(`CREATE TABLE "plugin_wago_mqtt_credential_retirements" (
      "controller_id" integer NOT NULL REFERENCES "plugin_wago_controllers"("id") ON DELETE CASCADE,
      "mqtt_server_id" integer NOT NULL, PRIMARY KEY ("controller_id", "mqtt_server_id")
    )`);
  }
  async down(runner: QueryRunner): Promise<void> {
    const rows = await runner.query('SELECT COUNT(*) AS count FROM "plugin_wago_network_changes" WHERE phase != ?', [
      'completed',
    ]);
    if (Number(rows[0].count)) throw new Error('Finish controller network changes before removing recovery storage');
    const retirements = await runner.query('SELECT COUNT(*) AS count FROM "plugin_wago_mqtt_credential_retirements"');
    if (Number(retirements[0].count)) throw new Error('Retire old broker credentials before removing their records');
    await runner.query('DROP TABLE "plugin_wago_mqtt_credential_retirements"');
    await runner.query('DROP TABLE "plugin_wago_network_changes"');
  }
}
