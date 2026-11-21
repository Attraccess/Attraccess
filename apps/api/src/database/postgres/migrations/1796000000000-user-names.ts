import { MigrationInterface, QueryRunner } from 'typeorm';
import { PREVIOUS_DEFAULT_BODIES, withDisplayNames, withNameVariables } from './user-names-email-defaults';

const SSO_CONFIGURATION_TABLES = ['sso_provider_oidc_configuration', 'sso_provider_saml_configuration'];

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
    await this.rewriteVariables(queryRunner, 'add');
  }

  /**
   * The editor lists the variables stored with a template, and an administrator cannot edit them, so every core
   * template (customised ones too, they may use the display name) gets the new names.
   */
  private async rewriteVariables(queryRunner: QueryRunner, direction: 'add' | 'remove'): Promise<void> {
    for (const type of Object.keys(PREVIOUS_DEFAULT_BODIES)) {
      const [row]: { variables: string }[] = await queryRunner.query(
        `SELECT "variables" FROM "email_templates" WHERE "type" = $1`,
        [type],
      );
      if (!row || typeof row.variables !== 'string') continue;
      const variables = withNameVariables(row.variables, direction);
      if (variables === row.variables) continue;
      await queryRunner.query(`UPDATE "email_templates" SET "variables" = $1 WHERE "type" = $2 AND "variables" = $3`, [
        variables,
        type,
        row.variables,
      ]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.rewriteVariables(queryRunner, 'remove');
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
