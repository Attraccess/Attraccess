import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, rename, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { NpmPluginMarketplaceImplementation } from './npm-plugin-marketplace';
import {
  BACKUP_DIRECTORY,
  InstalledNpmPlugin,
  STATE_FILE,
  TRANSACTION_FILE,
  backupDirectoryName,
  readInstalledNpmPlugins,
  samePermissions,
} from './npm-plugin.service.feature-definitions';
import { pluginRemovalClosure } from './plugin-dependencies';
import { PluginService } from './plugin.service';
export abstract class NpmPluginRemovalImplementation extends NpmPluginMarketplaceImplementation {
  removalPlan(name: string): InstalledNpmPlugin[] {
    this.installed(name);
    return pluginRemovalClosure(name, this.listInstalled());
  }

  async removeInstalled(name: string, deferRestart = false, approvedDependants: string[] = []): Promise<void> {
    await this.mutateInstalls(async () => {
      const removing = this.removalPlan(name);
      const dependants = removing.filter((plugin) => plugin.name !== name).map((plugin) => plugin.name);
      if (!samePermissions(dependants, approvedDependants))
        throw new BadRequestException(
          `Cannot remove ${name}: required by ${dependants.join(', ') || 'a changed dependency graph'}. Explicitly approve removing these plugins together, or keep it.`,
        );
      const moved: Array<{ target: string; backup: string }> = [];
      const records = readInstalledNpmPlugins().filter((plugin) => !removing.some(({ name }) => name === plugin.name));
      const moves = removing.map((plugin) => ({
        installPath: plugin.installPath,
        backupName: backupDirectoryName(plugin.installPath),
        hadTarget: existsSync(join(PluginService.PLUGIN_PATH, plugin.installPath)),
      }));
      await this.writeTransaction(records, moves);
      try {
        for (const [index, installed] of removing.entries()) {
          const target = join(PluginService.PLUGIN_PATH, installed.installPath);
          const backup = join(PluginService.PLUGIN_PATH, BACKUP_DIRECTORY, moves[index].backupName);
          if (existsSync(target)) {
            await mkdir(join(PluginService.PLUGIN_PATH, BACKUP_DIRECTORY), { recursive: true });
            await rename(target, backup);
            moved.push({ target, backup });
          }
        }
        if (removing.length === 1) await this.writeStateWithout(name);
        else await this.writeRecords(records);
      } catch (error) {
        for (const { target, backup } of moved.reverse()) await rename(backup, target);
        await rm(join(PluginService.PLUGIN_PATH, TRANSACTION_FILE), { force: true });
        throw error;
      }
      try {
        await rm(join(PluginService.PLUGIN_PATH, TRANSACTION_FILE), { force: true });
      } catch (error) {
        this.logger.error('Failed to clear plugin transaction journal', error);
      }
      for (const installed of removing) {
        try {
          PluginService.clearPluginQuarantine(installed.installPath);
        } catch (error) {
          this.logger.error(`Failed to clear quarantine for ${installed.name}`, error);
        }
      }
      for (const { backup } of moved) {
        try {
          await this.removeBackup(backup);
        } catch (error) {
          this.logger.error('Failed to remove uninstalled package files', error);
        }
      }
      // Keep plugin data and secrets, as in the existing npm removal lifecycle.
      if (!deferRestart) new PluginService().requestRestart();
    });
  }

  protected async writeStateWithout(name: string): Promise<void> {
    const statePath = join(PluginService.PLUGIN_PATH, STATE_FILE);
    const temporaryPath = `${statePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(
        temporaryPath,
        JSON.stringify(readInstalledNpmPlugins().filter((plugin) => plugin.name !== name)),
      );
      await rename(temporaryPath, statePath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }
}
