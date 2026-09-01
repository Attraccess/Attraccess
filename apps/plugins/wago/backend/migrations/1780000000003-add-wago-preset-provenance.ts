import { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';

export class AddWagoPresetProvenance1780000000003 implements MigrationInterface {
  name = 'AddWagoPresetProvenance1780000000003';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "plugin_wago_configuration_drafts" ADD COLUMN "preset_provenance" text');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "plugin_wago_configuration_drafts" DROP COLUMN "preset_provenance"');
  }
}
