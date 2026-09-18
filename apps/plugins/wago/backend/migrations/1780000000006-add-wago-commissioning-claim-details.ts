import { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';

export class AddWagoCommissioningClaimDetails1780000000006 implements MigrationInterface {
  name = 'AddWagoCommissioningClaimDetails1780000000006';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "plugin_wago_commissioning_sessions" ADD COLUMN "controller_name" varchar');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "plugin_wago_commissioning_sessions" DROP COLUMN "controller_name"');
  }
}
