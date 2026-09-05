import { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';

export class AddWagoRejectionAcknowledgement1780010590000 implements MigrationInterface {
  name = 'AddWagoRejectionAcknowledgement1780010590000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "plugin_wago_configuration_revisions" ADD COLUMN "rejection_acknowledged_at" varchar',
    );
    await queryRunner.query(
      'ALTER TABLE "plugin_wago_configuration_revisions" ADD COLUMN "rejection_acknowledged_by" integer',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "plugin_wago_configuration_revisions" DROP COLUMN "rejection_acknowledged_by"',
    );
    await queryRunner.query(
      'ALTER TABLE "plugin_wago_configuration_revisions" DROP COLUMN "rejection_acknowledged_at"',
    );
  }
}
