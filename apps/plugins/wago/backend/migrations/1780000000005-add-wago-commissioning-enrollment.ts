import { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';

export class AddWagoCommissioningEnrollment1780000000005 implements MigrationInterface {
  name = 'AddWagoCommissioningEnrollment1780000000005';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "plugin_wago_commissioning_sessions" ADD COLUMN "enrollment_id" integer');
    await queryRunner.query('ALTER TABLE "plugin_wago_commissioning_sessions" ADD COLUMN "pairing_code" varchar');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "plugin_wago_commissioning_sessions" DROP COLUMN "pairing_code"');
    await queryRunner.query('ALTER TABLE "plugin_wago_commissioning_sessions" DROP COLUMN "enrollment_id"');
  }
}
