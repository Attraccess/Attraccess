import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { existsSync } from 'fs';

import { rm } from 'fs/promises';

import { join } from 'path';

import { PluginMigrationService } from './plugin-migration.service';

import { PluginBleService } from './ble/plugin-ble.service';

import { PluginService } from './plugin.service';

/**
 * Removes an uploaded plugin: drops its tables, deletes its directory and clears its quarantine. It sits
 * above both PluginService and PluginMigrationService, because migrations find plugin bundles through PluginService.
 */
@Injectable()
export class PluginUninstallService {
  private static readonly logger = new Logger('PluginService');

  constructor(
    private readonly pluginService: PluginService,
    private readonly ble: PluginBleService,
  ) {}

  async deletePlugin(pluginId: string, deferRestart = false) {
    // Refused plugins (SDK 1.x, unsupported engine) are listed too, so an admin can remove them.
    const plugin = PluginService.getManifestById(pluginId);

    if (!plugin) {
      PluginUninstallService.logger.error(`Plugin with id ${pluginId} not found`);
      throw new NotFoundException('Plugin not found');
    }

    const pluginFolder = join(PluginService.PLUGIN_PATH, plugin.pluginDirectory);

    // if folder does not exist, throw error
    if (!existsSync(pluginFolder)) {
      PluginUninstallService.logger.error(`Plugin folder ${pluginFolder} of plugin ${plugin.name} not found`);
      throw new NotFoundException('Plugin not found');
    }

    // Drop the plugin's tables and their bookkeeping BEFORE the files are removed — the storage declaration that
    // names them lives in the plugin bundle and must still be on disk. A failure here is logged but never blocks
    // the uninstall: the admin asked for the plugin to be gone.
    // A refused plugin's code never runs, not even to find its tables: they (if any) are left in place.
    if (!PluginService.isPluginRefused(plugin) && PluginMigrationService.hasStorage(plugin)) {
      try {
        await PluginMigrationService.dropStorage(plugin);
      } catch (error) {
        PluginUninstallService.logger.error(
          `Failed to drop the storage of plugin ${plugin.name}; removing files anyway. Its tables may be orphaned.`,
          error as Error,
        );
      }
    }

    // The plugin's BLE endpoints reference a plugin that is going away. A failure is logged, never blocking.
    try {
      await this.ble.deleteAllForPlugin(plugin.id);
    } catch (error) {
      PluginUninstallService.logger.error(`Failed to delete BLE endpoints of plugin ${plugin.name}`, error as Error);
    }

    // delete folder. The plugin's RBAC permission rows stay: deleting them would cascade to every role and
    // API-token grant. The next boot marks them unavailable, and a reinstall brings them back with their grants.
    await rm(pluginFolder, { recursive: true });
    try {
      PluginService.clearPluginQuarantine(plugin.pluginDirectory);
    } catch (error) {
      PluginUninstallService.logger.error(
        `Failed to clear quarantine for deleted plugin ${plugin.name}`,
        error as Error,
      );
    }

    // restart app
    if (!deferRestart) this.pluginService.requestRestart();
  }
}
