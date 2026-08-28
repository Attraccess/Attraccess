import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameOwnerRoleToAdministrator1783200000000 implements MigrationInterface {
  name = 'RenameOwnerRoleToAdministrator1783200000000';

  // SSO providers persist role mappings as JSON keyed by RBAC role key; rename the key there too
  // so existing IdP mappings keep granting the (renamed) administrator role.
  private async migrateSsoPermissionMappings(queryRunner: QueryRunner, fromKey: string, toKey: string): Promise<void> {
    const tables = ['sso_provider_oidc_configuration', 'sso_provider_saml_configuration'];
    for (const table of tables) {
      const rows = await queryRunner.query(
        `SELECT "id", "permissionMappings" FROM "${table}" WHERE "permissionMappings" IS NOT NULL`,
      );
      for (const row of rows) {
        const parsed = typeof row.permissionMappings === 'string'
          ? JSON.parse(row.permissionMappings)
          : row.permissionMappings;
        if (!parsed || typeof parsed !== 'object') continue;
        const migrated: Record<string, string[]> = {};
        for (const [key, value] of Object.entries(parsed)) {
          migrated[key === fromKey ? toKey : key] = value as string[];
        }
        await queryRunner.query(`UPDATE "${table}" SET "permissionMappings" = ? WHERE "id" = ?`, [
          JSON.stringify(migrated),
          row.id,
        ]);
      }
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "role" SET "key" = 'administrator', "name" = 'Administrator' WHERE "key" = 'owner'`,
    );
    await this.migrateSsoPermissionMappings(queryRunner, 'owner', 'administrator');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "role" SET "key" = 'owner', "name" = 'Owner' WHERE "key" = 'administrator'`,
    );
    await this.migrateSsoPermissionMappings(queryRunner, 'administrator', 'owner');
  }
}
