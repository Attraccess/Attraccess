import { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';

export class AddWagoRevisionEditorMetadata1780010580000 implements MigrationInterface {
  name = 'AddWagoRevisionEditorMetadata1780010580000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "plugin_wago_configuration_revisions" ADD COLUMN "preset_provenance" text');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "plugin_wago_configuration_revisions" DROP COLUMN "preset_provenance"');
  }
}
