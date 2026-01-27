import { MigrationInterface, QueryRunner } from 'typeorm';

export class SsoPermissionMappings1769012345678 implements MigrationInterface {
  name = 'SsoPermissionMappings1769012345678';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sso_provider_oidc_configuration" ADD COLUMN "permissionMappings" json`);
    await queryRunner.query(`ALTER TABLE "sso_provider_saml_configuration" ADD COLUMN "permissionMappings" json`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sso_provider_saml_configuration" DROP COLUMN "permissionMappings"`);
    await queryRunner.query(`ALTER TABLE "sso_provider_oidc_configuration" DROP COLUMN "permissionMappings"`);
  }
}
