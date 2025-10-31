import { MigrationInterface, QueryRunner } from 'typeorm';

export class SsoOidcAddScopesAndClaimPaths1761903220000 implements MigrationInterface {
  name = 'SsoOidcAddScopesAndClaimPaths1761903220000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sso_provider_oidc_configuration" ADD COLUMN "scopes" varchar`
    );
    await queryRunner.query(
      `ALTER TABLE "sso_provider_oidc_configuration" ADD COLUMN "usernameClaimPaths" varchar`
    );
    await queryRunner.query(
      `ALTER TABLE "sso_provider_oidc_configuration" ADD COLUMN "emailClaimPaths" varchar`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Attempt to drop columns (supported on modern SQLite). If unsupported, a manual table rebuild would be required.
    await queryRunner.query(
      `ALTER TABLE "sso_provider_oidc_configuration" DROP COLUMN "emailClaimPaths"`
    );
    await queryRunner.query(
      `ALTER TABLE "sso_provider_oidc_configuration" DROP COLUMN "usernameClaimPaths"`
    );
    await queryRunner.query(
      `ALTER TABLE "sso_provider_oidc_configuration" DROP COLUMN "scopes"`
    );
  }
}


