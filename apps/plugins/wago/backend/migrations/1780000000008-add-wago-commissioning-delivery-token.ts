import { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';

export class AddWagoCommissioningDeliveryToken1780000000008 implements MigrationInterface {
  name = 'AddWagoCommissioningDeliveryToken1780000000008';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "plugin_wago_commissioning_sessions" ADD COLUMN "delivery_token" varchar');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(
      'SELECT 1 FROM "plugin_wago_commissioning_sessions" WHERE "delivery_token" IS NOT NULL LIMIT 1',
    );
    if (rows.length) throw new Error('Recover runtime deliveries before removing their saved ownership tokens');
    await queryRunner.query('ALTER TABLE "plugin_wago_commissioning_sessions" DROP COLUMN "delivery_token"');
  }
}
