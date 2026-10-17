import type { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';

/** Retain the historical create migration for fresh databases, then remove its table. */
export class DropWagoCommissioningLease1780010640000 implements MigrationInterface {
  name = 'DropWagoCommissioningLease1780010640000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "plugin_wago_commissioning_lease"');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "plugin_wago_commissioning_lease" (
      "fingerprint_hash" varchar(64) PRIMARY KEY NOT NULL,
      "owner" varchar NOT NULL,
      "lease_until" bigint NOT NULL,
      "operation_until" bigint NOT NULL,
      "recovery_after" bigint NOT NULL
    )`);
  }
}
