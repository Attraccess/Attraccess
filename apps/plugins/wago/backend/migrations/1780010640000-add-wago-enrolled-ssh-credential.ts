import { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';

export class AddWagoEnrolledSshCredential1780010640000 implements MigrationInterface {
  name = 'AddWagoEnrolledSshCredential1780010640000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "plugin_wago_commissioning_sessions" ADD COLUMN "encrypted_ssh_credential" text',
    );
    await queryRunner.query(
      'ALTER TABLE "plugin_wago_commissioning_sessions" ADD COLUMN "ssh_credential_rotated_at" varchar',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "plugin_wago_commissioning_sessions" DROP COLUMN "ssh_credential_rotated_at"');
    await queryRunner.query('ALTER TABLE "plugin_wago_commissioning_sessions" DROP COLUMN "encrypted_ssh_credential"');
  }
}
