import { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';

export class AddWagoCommissioningProgress1780000000007 implements MigrationInterface {
  name = 'AddWagoCommissioningProgress1780000000007';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "plugin_wago_commissioning_sessions" ADD COLUMN "progress_percent" integer');
    await queryRunner.query('ALTER TABLE "plugin_wago_commissioning_sessions" ADD COLUMN "progress_step" varchar');
    await queryRunner.query('ALTER TABLE "plugin_wago_commissioning_sessions" ADD COLUMN "progress_detail" varchar');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "plugin_wago_commissioning_sessions" DROP COLUMN "progress_detail"');
    await queryRunner.query('ALTER TABLE "plugin_wago_commissioning_sessions" DROP COLUMN "progress_step"');
    await queryRunner.query('ALTER TABLE "plugin_wago_commissioning_sessions" DROP COLUMN "progress_percent"');
  }
}
