import { MigrationInterface, QueryRunner } from 'typeorm';
import { PREVIOUS_DEFAULT_BODIES } from './1796000000000-user-names-email-defaults';

const SSO_CONFIGURATION_TABLES = ['sso_provider_oidc_configuration', 'sso_provider_saml_configuration'];

/** What the default templates change: they greet and name the inviter by display name instead of username. */
function withDisplayNames(body: string): string {
  return body
    .replace('name=user.username', 'name=user.displayName')
    .replace('inviter=inviter.username', 'inviter=inviter.displayName');
}

/**
 * Optional first and last name for users (ATT-1385). The display name is computed, never stored. Stored default email
 * templates move to the display name only where the stored body still equals the previous default; templates an
 * administrator changed keep greeting by username.
 */
export class PostgresUserNames1796000000000 implements MigrationInterface {
  name = 'PostgresUserNames1796000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" ADD "firstName" text`);
    await queryRunner.query(`ALTER TABLE "user" ADD "lastName" text`);
    for (const table of SSO_CONFIGURATION_TABLES) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD "firstNameClaimPath" text`);
      await queryRunner.query(`ALTER TABLE "${table}" ADD "lastNameClaimPath" text`);
    }

    for (const [type, previous] of Object.entries(PREVIOUS_DEFAULT_BODIES)) {
      await queryRunner.query(`UPDATE "email_templates" SET "body" = $1 WHERE "type" = $2 AND "body" = $3`, [
        withDisplayNames(previous),
        type,
        previous,
      ]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [type, previous] of Object.entries(PREVIOUS_DEFAULT_BODIES)) {
      await queryRunner.query(`UPDATE "email_templates" SET "body" = $1 WHERE "type" = $2 AND "body" = $3`, [
        previous,
        type,
        withDisplayNames(previous),
      ]);
    }
    for (const table of SSO_CONFIGURATION_TABLES) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "lastNameClaimPath"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "firstNameClaimPath"`);
    }
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "lastName"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "firstName"`);
  }
}
