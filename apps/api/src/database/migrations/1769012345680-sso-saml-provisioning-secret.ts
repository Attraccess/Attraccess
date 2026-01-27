import { MigrationInterface, QueryRunner } from 'typeorm';

export class SsoSamlProvisioningSecret1769012345680 implements MigrationInterface {
  name = 'SsoSamlProvisioningSecret1769012345680';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sso_provider_saml_configuration" ADD COLUMN "provisioningSecret" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sso_provider_saml_configuration" DROP COLUMN "provisioningSecret"`);
  }
}
