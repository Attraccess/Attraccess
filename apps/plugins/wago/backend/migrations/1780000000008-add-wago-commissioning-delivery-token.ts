import { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';

export class AddWagoCommissioningDeliveryToken1780000000008 implements MigrationInterface {
  name = 'AddWagoCommissioningDeliveryToken1780000000008';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "plugin_wago_commissioning_sessions" ADD COLUMN "delivery_token" varchar');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "plugin_wago_commissioning_sessions" DROP COLUMN "delivery_token"');
  }
}
