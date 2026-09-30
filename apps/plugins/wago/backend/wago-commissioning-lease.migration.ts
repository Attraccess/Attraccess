import type { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';

export class WagoCommissioningLease1780000000011 implements MigrationInterface {
  name = 'WagoCommissioningLease1780000000011';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "plugin_wago_commissioning_lease" (
      "fingerprint_hash" varchar(64) PRIMARY KEY NOT NULL,
      "owner" varchar NOT NULL,
      "lease_until" bigint NOT NULL,
      "operation_until" bigint NOT NULL,
      "recovery_after" bigint NOT NULL
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query('SELECT COUNT(*) AS count FROM "plugin_wago_commissioning_lease"');
    if (Number(rows[0].count) !== 0) throw new Error('Recover commissioning leases before removing lease storage');
    await queryRunner.query('DROP TABLE "plugin_wago_commissioning_lease"');
  }
}
