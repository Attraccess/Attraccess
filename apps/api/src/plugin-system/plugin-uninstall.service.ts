import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';

import { ModuleRef } from '@nestjs/core';

import { existsSync } from 'fs';

import { rm } from 'fs/promises';

import { join } from 'path';

import { PluginMigrationService } from './plugin-migration.service';

import { PluginBleService } from './ble/plugin-ble.service';

import { PluginReadersService } from './readers/plugin-readers.service';

import { PluginService } from './plugin.service';
import { markPluginRestartRequired } from './runtime/restart-required';
import { markPluginRemoved } from './runtime/removed-plugins';

import { ResourceHealthService } from '../resources/health/resource-health.service';

import { clearAllPluginResourceHealth, retirePluginResourceHealth } from './runtime/plugin-resource-health';

import { releaseStorageNames } from './plugin-storage/storage-registry';

/**
 * Removes an uploaded plugin: drops its tables, deletes its directory and clears its quarantine. It sits
 * above both PluginService and PluginMigrationService, because migrations find plugin bundles through PluginService.
 */
@Injectable()
export class PluginUninstallService {
  private static readonly logger = new Logger('PluginService');

  constructor(
    private readonly ble: PluginBleService,
    private readonly readers: PluginReadersService,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  /**
   * Removes the health entries of an uninstalled plugin, so no door stays blocked by a plugin that is gone (disabling
   * keeps them, an admin can clear those by hand). Used for uploaded and npm-installed plugins alike. A failure is
   * logged, never blocking.
   */
  async clearHealthEntries(pluginName: string): Promise<void> {
    // Its runtime runs until the restart: a report after the clear must not leave an entry behind, and it must not
    // register readers or BLE endpoints again.
    retirePluginResourceHealth(pluginName);
    for (const manifest of PluginService.getDiscoveredPlugins())
      if (manifest.name === pluginName) markPluginRemoved(manifest.id);
    try {
      const health = this.moduleRef?.get(ResourceHealthService, { strict: false });
      if (health) await clearAllPluginResourceHealth(pluginName, health);
    } catch (error) {
      PluginUninstallService.logger.error(`Failed to clear the health entries of plugin ${pluginName}`, error as Error);
    }
  }

  async deletePlugin(pluginId: string) {
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

    // Its code runs until the restart: refuse its reader and BLE calls before their rows go.
    markPluginRemoved(plugin.id);

    // The plugin's BLE endpoints reference a plugin that is going away. A failure is logged, never blocking.
    try {
      await this.ble.deleteAllForPlugin(plugin.id);
    } catch (error) {
      PluginUninstallService.logger.error(`Failed to delete BLE endpoints of plugin ${plugin.name}`, error as Error);
    }

    // The plugin's readers and their assignments go with it (disabling keeps them). A failure never blocks.
    try {
      await this.readers.deleteAllForPlugin(plugin.id);
    } catch (error) {
      PluginUninstallService.logger.error(`Failed to delete the readers of plugin ${plugin.name}`, error as Error);
    }

    await this.clearHealthEntries(plugin.name);

    // delete folder. The plugin's RBAC permission rows stay: deleting them would cascade to every role and
    // API-token grant. The next boot marks them unavailable, and a reinstall brings them back with their grants.
    await rm(pluginFolder, { recursive: true });
    // Its table and index names are free again: a reinstall before the restart must not meet its old claim.
    releaseStorageNames(plugin.name);
    try {
      PluginService.clearPluginQuarantine(plugin.pluginDirectory);
    } catch (error) {
      PluginUninstallService.logger.error(
        `Failed to clear quarantine for deleted plugin ${plugin.name}`,
        error as Error,
      );
    }

    // Its files are gone; the code that runs from memory stops at the next restart.
    markPluginRestartRequired();
  }
}
