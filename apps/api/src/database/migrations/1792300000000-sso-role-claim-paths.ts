import { MigrationInterface, QueryRunner } from 'typeorm';

export class SsoRoleClaimPaths1792300000000 implements MigrationInterface {
  name = 'SsoRoleClaimPaths1792300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sso_provider_oidc_configuration" ADD COLUMN "roleClaimPaths" text`);
    await queryRunner.query(`ALTER TABLE "sso_provider_saml_configuration" ADD COLUMN "roleAttributeKeys" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sso_provider_oidc_configuration" DROP COLUMN "roleClaimPaths"`);
    await queryRunner.query(`ALTER TABLE "sso_provider_saml_configuration" DROP COLUMN "roleAttributeKeys"`);
  }
}
