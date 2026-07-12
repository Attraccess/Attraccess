import { MigrationInterface, QueryRunner } from 'typeorm';

// Map old boolean permission DTO keys to RBAC role keys for SSO provider config migration
const LEGACY_KEY_TO_RBAC_ROLE: Record<string, string> = {
  canManageResources: 'resource-manager',
  canManageSystemConfiguration: 'system-admin',
  canManageUsers: 'user-manager',
  canManageBilling: 'billing-manager',
};

export class DropBooleanPermissions1782500000000 implements MigrationInterface {
  name = 'DropBooleanPermissions1782500000000';

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

    // Drop boolean permission columns — SQLite 3.35+ supports ALTER TABLE DROP COLUMN directly.
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "canManageResources"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "canManageSystemConfiguration"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "canManageUsers"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "canManageBilling"`);

    // Ensure at least one user holds the 'owner' role. On fresh installs the first user gets it
    // automatically, but migrated instances that had no first-user bootstrap need one assigned.
    const ownerRoleRows = await queryRunner.query(`SELECT "id" FROM "role" WHERE "key" = ?`, ['owner']);
    if (ownerRoleRows.length > 0) {
      const ownerRoleId: number = ownerRoleRows[0].id;
      const existingOwners = await queryRunner.query(
        `SELECT COUNT(*) as cnt FROM "user_role" WHERE "roleId" = ? AND "source" = 'manual'`,
        [ownerRoleId],
      );
      if (existingOwners[0]?.cnt === 0 || existingOwners[0]?.cnt === '0') {
        // Assign owner to the oldest non-deleted user who holds the system-admin role, or else the oldest user
        const systemAdminRoleRows = await queryRunner.query(`SELECT "id" FROM "role" WHERE "key" = ?`, ['system-admin']);
        let candidateUserId: number | null = null;
        if (systemAdminRoleRows.length > 0) {
          const rows = await queryRunner.query(
            `SELECT ur."userId" FROM "user_role" ur INNER JOIN "user" u ON u.id = ur."userId"
             WHERE ur."roleId" = ? AND u."deletedAt" IS NULL ORDER BY u."createdAt" ASC LIMIT 1`,
            [systemAdminRoleRows[0].id],
          );
          candidateUserId = rows[0]?.userId ?? null;
        }
        if (!candidateUserId) {
          const rows = await queryRunner.query(
            `SELECT "id" FROM "user" WHERE "deletedAt" IS NULL ORDER BY "createdAt" ASC LIMIT 1`,
          );
          candidateUserId = rows[0]?.id ?? null;
        }
        if (candidateUserId) {
          await queryRunner.query(
            `INSERT OR IGNORE INTO "user_role" ("userId", "roleId", "source") VALUES (?, ?, 'manual')`,
            [candidateUserId, ownerRoleId],
          );
        }
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore boolean columns and recover data from user_role (which still exists at this point)
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "canManageResources" boolean NOT NULL DEFAULT (0)`);
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "canManageSystemConfiguration" boolean NOT NULL DEFAULT (0)`);
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "canManageUsers" boolean NOT NULL DEFAULT (0)`);
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "canManageBilling" boolean NOT NULL DEFAULT (0)`);

    // Recover boolean values from user_role assignments
    const roleMap = [
      { column: 'canManageResources', roleKey: 'resource-manager' },
      { column: 'canManageSystemConfiguration', roleKey: 'system-admin' },
      { column: 'canManageUsers', roleKey: 'user-manager' },
      { column: 'canManageBilling', roleKey: 'billing-manager' },
    ];
    for (const { column, roleKey } of roleMap) {
      const rows = await queryRunner.query(`SELECT "id" FROM "role" WHERE "key" = ?`, [roleKey]);
      if (!rows.length) continue;
      await queryRunner.query(
        `UPDATE "user" SET "${column}" = 1 WHERE "id" IN (SELECT "userId" FROM "user_role" WHERE "roleId" = ?)`,
        [rows[0].id],
      );
    }

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
