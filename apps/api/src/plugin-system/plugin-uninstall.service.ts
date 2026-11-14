import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { existsSync } from 'fs';

import { rm } from 'fs/promises';

import { join } from 'path';

import { PluginMigrationService } from './plugin-migration.service';

import { PluginService } from './plugin.service';

/**
 * Removes an uploaded plugin: reverts its migrations, deletes its directory and clears its quarantine. It sits
 * above both PluginService and PluginMigrationService, because migrations find plugin bundles through PluginService.
 */
@Injectable()
export class PluginUninstallService {
  private static readonly logger = new Logger('PluginService');

  constructor(private readonly pluginService: PluginService) {}

  async deletePlugin(pluginId: string, deferRestart = false) {
    const plugin = PluginService.getPlugins().find((plugin) => plugin.id === pluginId);

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

    // Revert the plugin's database migrations (drops its tables/data) BEFORE the
    // files are removed — the migration classes live in the plugin bundle and
    // must still be on disk to run. A failure here is logged but never blocks the
    // uninstall: the admin asked for the plugin to be gone.
    if (PluginMigrationService.hasMigrations(plugin)) {
      try {
        await PluginMigrationService.runDownMigrations(plugin);
      } catch (error) {
        PluginUninstallService.logger.error(
          `Failed to revert migrations for plugin ${plugin.name}; removing files anyway. Its tables may be orphaned.`,
          error as Error,
        );
      }
    }

    // delete folder
    await rm(pluginFolder, { recursive: true });
    try {
      PluginService.clearPluginQuarantine(plugin.pluginDirectory);
    } catch (error) {
      PluginUninstallService.logger.error(`Failed to clear quarantine for deleted plugin ${plugin.name}`, error as Error);
    }

    // restart app
    if (!deferRestart) this.pluginService.requestRestart();
  }
}
