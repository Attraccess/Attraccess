import type { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';

export class WagoManagedUpdates1780010650000 implements MigrationInterface {
  name = 'WagoManagedUpdates1780010650000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE "plugin_wago_managed_access" (
      "session_id" integer PRIMARY KEY NOT NULL, "controller_id" integer,
      "host" varchar NOT NULL, "fingerprint" varchar NOT NULL, "token" varchar NOT NULL,
      "state" varchar NOT NULL, "encrypted_credentials" text NOT NULL, "key_fingerprint" varchar NOT NULL
    )`);
    await runner.query('CREATE INDEX "wago_managed_controller" ON "plugin_wago_managed_access" ("controller_id")');
    await runner.query(
      'CREATE TABLE "plugin_wago_runtime_updates" ("controller_id" integer PRIMARY KEY NOT NULL, "metadata" text)',
    );
    await runner.query(
      'CREATE TABLE "plugin_wago_device_operations" ("fingerprint" varchar PRIMARY KEY NOT NULL, "owner" varchar, "lease_until" bigint NOT NULL DEFAULT 0)',
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    const rows = await runner.query('SELECT COUNT(*) AS count FROM "plugin_wago_managed_access"');
    if (Number(rows[0].count)) throw new Error('Retire managed controller credentials before removing their storage');
    await runner.query('DROP TABLE "plugin_wago_device_operations"');
    await runner.query('DROP TABLE "plugin_wago_runtime_updates"');
    await runner.query('DROP TABLE "plugin_wago_managed_access"');
  }
}
