import { Permission } from '@attraccess/database-entities';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { DeclaredPluginPermission, getDeclaredPluginPermissions } from '../../plugin-system/runtime/plugin-permissions';
import { RbacService } from './rbac.service';

export interface PluginPermissionSyncResult {
  registered: string[];
  madeAvailable: string[];
  madeUnavailable: string[];
}

/**
 * Writes the permission keys of the plugins loaded in this boot into the catalog, after the host migrations ran.
 *
 * - A key seen for the first time is inserted and granted to its default system roles. That happens once: later
 *   boots never grant it again, so an administrator's removal sticks.
 * - `administrator` is granted every registered key on every boot, so administrator-equivalence (the last-admin
 *   lockout guard) keeps meaning "holds the whole catalog".
 * - Plugin keys no loaded plugin declares become unavailable. Rows are never deleted: the foreign keys cascade, so a
 *   delete would wipe every role and API-token grant. Unavailable keys grant nothing until the plugin loads again.
 */
@Injectable()
export class PluginPermissionSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PluginPermissionSyncService.name);

  constructor(
    @InjectRepository(Permission) private readonly permissionRepository: Repository<Permission>,
    private readonly rbacService: RbacService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.sync(getDeclaredPluginPermissions());
    } catch (error) {
      // Never block boot: plugin routes then deny (unknown keys grant nothing), core RBAC is unaffected.
      this.logger.error(`Failed to register plugin permissions: ${(error as Error).message}`, (error as Error).stack);
    }
  }

  async sync(declared: readonly DeclaredPluginPermission[]): Promise<PluginPermissionSyncResult> {
    const result = await this.permissionRepository.manager.transaction((manager) => this.syncIn(manager, declared));
    if (result.registered.length + result.madeAvailable.length + result.madeUnavailable.length > 0) {
      this.logger.log(
        `Plugin permissions: registered [${result.registered.join(', ')}], available again [${result.madeAvailable.join(', ')}], unavailable [${result.madeUnavailable.join(', ')}]`,
      );
      await this.rbacService.invalidateAllPermissions();
    }
    return result;
  }

  private async syncIn(
    manager: EntityManager,
    declared: readonly DeclaredPluginPermission[],
  ): Promise<PluginPermissionSyncResult> {
    const existing = new Map((await manager.find(Permission)).map((row) => [row.key, row]));
    const result: PluginPermissionSyncResult = { registered: [], madeAvailable: [], madeUnavailable: [] };
    const active = new Set<string>();

    for (const permission of declared) {
      const row = existing.get(permission.key);
      if (row && row.pluginName !== permission.pluginName) {
        // Plugin load rejects this; reaching it means another instance registered the key meanwhile.
        this.logger.error(
          `Plugin ${permission.pluginName} declares permission ${permission.key}, which ${row.pluginName ? `plugin ${row.pluginName} owns` : 'is a core permission'}; skipping it`,
        );
        continue;
      }
      active.add(permission.key);
      const texts = {
        label: permission.label.en,
        labelDe: permission.label.de,
        description: permission.description.en,
        descriptionDe: permission.description.de,
        category: `plugin:${permission.pluginName}`,
        categoryLabel: permission.category.en,
        categoryLabelDe: permission.category.de,
      };
      if (!row) {
        await manager.insert(Permission, {
          key: permission.key,
          pluginName: permission.pluginName,
          ...texts,
          available: true,
        });
        await this.grant(manager, permission.key, [...permission.defaultRoles, 'administrator']);
        result.registered.push(permission.key);
        continue;
      }
      if (!row.available) result.madeAvailable.push(permission.key);
      await manager.update(Permission, { key: permission.key }, { ...texts, available: true });
      await this.grant(manager, permission.key, ['administrator']);
    }

    for (const row of existing.values()) {
      if (row.pluginName !== null && row.available && !active.has(row.key)) {
        await manager.update(Permission, { key: row.key }, { available: false });
        result.madeUnavailable.push(row.key);
      }
    }
    return result;
  }

  private async grant(manager: EntityManager, permissionKey: string, roleKeys: readonly string[]): Promise<void> {
    const keys = [...new Set(roleKeys)];
    await manager.query(
      `INSERT OR IGNORE INTO "role_permission" ("roleId", "permissionKey")
       SELECT "id", ? FROM "role" WHERE "isSystemManaged" = 1 AND "key" IN (${keys.map(() => '?').join(', ')})`,
      [permissionKey, ...keys],
    );
  }
}
