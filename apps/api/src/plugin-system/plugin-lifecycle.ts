import { NotFoundException } from '@nestjs/common';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { rm } from 'fs/promises';
import { join } from 'path';
import { PluginMigrationService } from './plugin-migration.service';
import { PluginZipInstallationImplementation } from './plugin-zip-installation';
import { PluginService } from './plugin.service';

function getImplementationClass(): typeof PluginService {
  return require('./plugin.service').PluginService;
}

export abstract class PluginLifecycleImplementation extends PluginZipInstallationImplementation {
  public static configure(config: { PLUGIN_DIR: string; RESTART_BY_EXIT: boolean }): void {
    getImplementationClass().removeBootGuardSignalHandlers();
    getImplementationClass().PLUGIN_PATH = config.PLUGIN_DIR; // Assume PLUGIN_DIR from appConfig is already resolved or correct
    getImplementationClass().RESTART_BY_EXIT_FLAG = config.RESTART_BY_EXIT;
    getImplementationClass().plugins = null; // Discovery may have been cached with an unset path before configure() ran; force a re-scan.
    getImplementationClass().loadedPlugins.clear();
    getImplementationClass().pluginLoadErrors.clear();
    getImplementationClass().pluginFailures = new Map(
      getImplementationClass()
        .readFailures()
        .map((failure) => [failure.pluginDirectory, failure]),
    );
    getImplementationClass().logger.log(
      `PluginService configured. Path: ${getImplementationClass().PLUGIN_PATH}, RestartByExit: ${getImplementationClass().RESTART_BY_EXIT_FLAG}`,
    );
    if (!getImplementationClass().PLUGIN_PATH) {
      getImplementationClass().logger.error('PLUGIN_DIR is not configured in AppConfig! Plugin system may not work.');
    }
  }

  // Returns the discovered plugins enriched with their backend load status so the
  // admin UI can surface plugins that failed to load (e.g. a missing dependency)
  // instead of silently showing them as if everything were fine.

  protected restartApp() {
    PluginService.logger.log('Restarting app');
    if (PluginService.RESTART_BY_EXIT_FLAG) {
      PluginService.logger.log('Restarting app by exiting');
      process.exit();
    }

    // restart app by starting a new process
    PluginService.logger.log('Restarting app by starting a new process');
    const subprocess = spawn(process.argv[0], process.argv.slice(1), {
      detached: true,
      stdio: 'inherit',
    });
    subprocess.unref();
    PluginService.logger.log('New process started, exiting current process');
    process.exit();
  }

  public requestRestart(): void {
    setTimeout(() => this.restartApp(), 1000);
  }

  public async deletePlugin(pluginId: string, deferRestart = false) {
    const plugin = PluginService.getPlugins().find((plugin) => plugin.id === pluginId);

    if (!plugin) {
      PluginService.logger.error(`Plugin with id ${pluginId} not found`);
      throw new NotFoundException('Plugin not found');
    }

    const pluginFolder = join(PluginService.PLUGIN_PATH, plugin.pluginDirectory);

    // if folder does not exist, throw error
    if (!existsSync(pluginFolder)) {
      PluginService.logger.error(`Plugin folder ${pluginFolder} of plugin ${plugin.name} not found`);
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
        PluginService.logger.error(
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
      PluginService.logger.error(`Failed to clear quarantine for deleted plugin ${plugin.name}`, error as Error);
    }

    // restart app
    if (!deferRestart) this.requestRestart();
  }
}
