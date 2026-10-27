import { MigrationInterface, QueryRunner } from 'typeorm';

export class SsoPermissionSyncTtl1791600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "sso_provider_oidc_configuration" ADD COLUMN "permissionSyncTtlMinutes" integer',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "sso_provider_oidc_configuration" DROP COLUMN "permissionSyncTtlMinutes"');
  }
}
