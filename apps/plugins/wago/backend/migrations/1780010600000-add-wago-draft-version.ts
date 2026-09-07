import { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';

export class AddWagoDraftVersion1780010600000 implements MigrationInterface {
  name = 'AddWagoDraftVersion1780010600000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "plugin_wago_configuration_drafts" ADD COLUMN "version" integer NOT NULL DEFAULT 1',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "plugin_wago_configuration_drafts" DROP COLUMN "version"');
  }
}
