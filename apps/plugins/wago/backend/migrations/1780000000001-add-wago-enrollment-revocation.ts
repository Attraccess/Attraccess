import { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';

export class AddWagoEnrollmentRevocation1780000000001 implements MigrationInterface {
  name = 'AddWagoEnrollmentRevocation1780000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "plugin_wago_enrollments" ADD COLUMN "revoked_at" varchar');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "plugin_wago_enrollments" DROP COLUMN "revoked_at"');
  }
}
