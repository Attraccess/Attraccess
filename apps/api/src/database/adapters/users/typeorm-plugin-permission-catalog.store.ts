import { Permission } from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import type {
  PermissionCatalogEntry,
  PluginPermissionCatalogStore,
  PluginPermissionTexts,
} from '../../../users-and-auth/rbac/plugin-permission-catalog.port';
import type { TransactionScope } from '../../unit-of-work';
import { TransactionContextResolver } from '../transaction-context';

@Injectable()
export class TypeOrmPluginPermissionCatalogStore implements PluginPermissionCatalogStore {
  constructor(private readonly tx: TransactionContextResolver) {}

  async listCatalog(scope: TransactionScope): Promise<PermissionCatalogEntry[]> {
    const rows = await this.tx
      .manager(scope)
      .find(Permission, { select: { key: true, pluginName: true, available: true } });
    return rows.map((row) => ({ key: row.key, pluginName: row.pluginName ?? null, available: row.available }));
  }

  async registerPluginPermission(
    key: string,
    pluginName: string,
    texts: PluginPermissionTexts,
    scope: TransactionScope,
  ): Promise<void> {
    await this.tx.manager(scope).insert(Permission, { key, pluginName, ...texts, available: true });
  }

  async refreshPluginPermission(key: string, texts: PluginPermissionTexts, scope: TransactionScope): Promise<void> {
    await this.tx.manager(scope).update(Permission, { key }, { ...texts, available: true });
  }

  async markUnavailable(key: string, scope: TransactionScope): Promise<void> {
    await this.tx.manager(scope).update(Permission, { key }, { available: false });
  }

  async grantToSystemRoles(permissionKey: string, roleKeys: readonly string[], scope: TransactionScope): Promise<void> {
    const keys = [...new Set(roleKeys)];
    if (keys.length === 0) return;
    await this.tx.manager(scope).query(
      `INSERT INTO "role_permission" ("roleId", "permissionKey")
       SELECT r."id", $1 FROM "role" r WHERE r."isSystemManaged" = true AND r."key" = ANY($2::text[])
         AND NOT EXISTS (SELECT 1 FROM "role_permission" rp WHERE rp."roleId" = r."id" AND rp."permissionKey" = $1)
       ON CONFLICT DO NOTHING`,
      [permissionKey, keys],
    );
  }
}
