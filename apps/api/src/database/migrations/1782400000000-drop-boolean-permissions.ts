import { MigrationInterface, QueryRunner } from 'typeorm';

// Map old boolean permission DTO keys to RBAC role keys for SSO provider config migration
const LEGACY_KEY_TO_RBAC_ROLE: Record<string, string> = {
  canManageResources: 'resource-manager',
  canManageSystemConfiguration: 'system-admin',
  canManageUsers: 'user-manager',
  canManageBilling: 'billing-manager',
};

export class DropBooleanPermissions1782400000000 implements MigrationInterface {
  name = 'DropBooleanPermissions1782400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Migrate SSO provider OIDC permissionMappings JSON keys from boolean names to RBAC role keys
    const oidcProviders = await queryRunner.query(
      `SELECT "id", "permissionMappings" FROM "sso_provider_oidc_configuration" WHERE "permissionMappings" IS NOT NULL`,
    );
    for (const row of oidcProviders) {
      const parsed = typeof row.permissionMappings === 'string'
        ? JSON.parse(row.permissionMappings)
        : row.permissionMappings;
      if (!parsed || typeof parsed !== 'object') continue;
      const migrated: Record<string, string[]> = {};
      for (const [key, value] of Object.entries(parsed)) {
        const newKey = LEGACY_KEY_TO_RBAC_ROLE[key] ?? key;
        migrated[newKey] = value as string[];
      }
      await queryRunner.query(
        `UPDATE "sso_provider_oidc_configuration" SET "permissionMappings" = ? WHERE "id" = ?`,
        [JSON.stringify(migrated), row.id],
      );
    }

    // Migrate SSO provider SAML permissionMappings JSON keys
    const samlProviders = await queryRunner.query(
      `SELECT "id", "permissionMappings" FROM "sso_provider_saml_configuration" WHERE "permissionMappings" IS NOT NULL`,
    );
    for (const row of samlProviders) {
      const parsed = typeof row.permissionMappings === 'string'
        ? JSON.parse(row.permissionMappings)
        : row.permissionMappings;
      if (!parsed || typeof parsed !== 'object') continue;
      const migrated: Record<string, string[]> = {};
      for (const [key, value] of Object.entries(parsed)) {
        const newKey = LEGACY_KEY_TO_RBAC_ROLE[key] ?? key;
        migrated[newKey] = value as string[];
      }
      await queryRunner.query(
        `UPDATE "sso_provider_saml_configuration" SET "permissionMappings" = ? WHERE "id" = ?`,
        [JSON.stringify(migrated), row.id],
      );
    }

    // Drop boolean permission columns from user table (data already migrated in rbac-data-model migration)
    // SQLite does not support DROP COLUMN directly, so recreate the table without those columns
    await queryRunner.query(`
      CREATE TABLE "user_new" AS
      SELECT
        "id", "username", "email", "isEmailVerified",
        "emailVerificationToken", "emailVerificationTokenExpiresAt",
        "passwordResetToken", "passwordResetTokenExpiresAt",
        "createdAt", "updatedAt", "deletedAt",
        "lastUsernameChangeAt", "lockedUntil", "failedLoginAttempts", "firstFailedLoginAt",
        "deleteAccountToken", "deleteAccountTokenExpiresAt", "deleteAccountRequestedAt",
        "externalIdentifier", "nfcKeySeedToken", "creditBalance", "billingFactor"
      FROM "user"
    `);

    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(`ALTER TABLE "user_new" RENAME TO "user"`);

    // Recreate unique indexes on user
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_user_username" ON "user" ("username")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_user_email" ON "user" ("email")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore boolean columns (data cannot be recovered, all false)
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "canManageResources" boolean NOT NULL DEFAULT (0)`);
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "canManageSystemConfiguration" boolean NOT NULL DEFAULT (0)`);
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "canManageUsers" boolean NOT NULL DEFAULT (0)`);
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "canManageBilling" boolean NOT NULL DEFAULT (0)`);

    // Revert SSO provider OIDC permissionMappings JSON keys (RBAC role keys → legacy boolean names)
    const rbacToLegacy = Object.fromEntries(
      Object.entries(LEGACY_KEY_TO_RBAC_ROLE).map(([k, v]) => [v, k]),
    );
    const oidcProviders = await queryRunner.query(
      `SELECT "id", "permissionMappings" FROM "sso_provider_oidc_configuration" WHERE "permissionMappings" IS NOT NULL`,
    );
    for (const row of oidcProviders) {
      const parsed = typeof row.permissionMappings === 'string'
        ? JSON.parse(row.permissionMappings)
        : row.permissionMappings;
      if (!parsed || typeof parsed !== 'object') continue;
      const reverted: Record<string, string[]> = {};
      for (const [key, value] of Object.entries(parsed)) {
        const oldKey = rbacToLegacy[key] ?? key;
        reverted[oldKey] = value as string[];
      }
      await queryRunner.query(
        `UPDATE "sso_provider_oidc_configuration" SET "permissionMappings" = ? WHERE "id" = ?`,
        [JSON.stringify(reverted), row.id],
      );
    }

    const samlProviders = await queryRunner.query(
      `SELECT "id", "permissionMappings" FROM "sso_provider_saml_configuration" WHERE "permissionMappings" IS NOT NULL`,
    );
    for (const row of samlProviders) {
      const parsed = typeof row.permissionMappings === 'string'
        ? JSON.parse(row.permissionMappings)
        : row.permissionMappings;
      if (!parsed || typeof parsed !== 'object') continue;
      const reverted: Record<string, string[]> = {};
      for (const [key, value] of Object.entries(parsed)) {
        const oldKey = rbacToLegacy[key] ?? key;
        reverted[oldKey] = value as string[];
      }
      await queryRunner.query(
        `UPDATE "sso_provider_saml_configuration" SET "permissionMappings" = ? WHERE "id" = ?`,
        [JSON.stringify(reverted), row.id],
      );
    }
  }
}
