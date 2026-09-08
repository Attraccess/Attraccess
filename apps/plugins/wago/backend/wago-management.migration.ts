import type { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';

/** Dedicated ATT-1057 migration ID. Export from migrations.ts during coordinator integration. */
export class WagoManagement1780000000010 implements MigrationInterface {
  name = 'WagoManagement1780000000010';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "plugin_wago_management" (
      "controller_id" integer PRIMARY KEY NOT NULL,
      "metadata_json" text,
      "encrypted_private_key" text,
      "lease_owner" varchar,
      "lease_until" bigint NOT NULL DEFAULT 0
    )`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    // Do not erase the only recovery record or active management key during downgrade.
    const rows = await queryRunner.query(
      'SELECT COUNT(*) AS count FROM "plugin_wago_management" WHERE "encrypted_private_key" IS NOT NULL OR "lease_owner" IS NOT NULL',
    );
    if (Number(rows[0].count) !== 0)
      throw new Error('Recover management transitions before removing management storage');
    await queryRunner.query('DROP TABLE "plugin_wago_management"');
  }
}
