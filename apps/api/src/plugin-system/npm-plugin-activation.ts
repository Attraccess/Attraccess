import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, rename, rm } from 'fs/promises';
import { join } from 'path';
import { NpmPluginAuditStateImplementation } from './npm-plugin-audit-observations';
import {
  BACKUP_DIRECTORY,
  NpmPluginAuditState,
  backupDirectoryName,
  pluginDirectory,
} from './npm-plugin.service.feature-definitions';
import { PluginService } from './plugin.service';
export abstract class NpmPluginActivationImplementation extends NpmPluginAuditStateImplementation {
  protected async activate(
    source: string,
    name: string,
    audit?: NpmPluginAuditState,
    backupName?: string,
  ): Promise<{ target: string; backup: string }> {
    const target = join(PluginService.PLUGIN_PATH, pluginDirectory(name));
    const backupDirectory = join(PluginService.PLUGIN_PATH, BACKUP_DIRECTORY);
    const backup = join(backupDirectory, backupName ?? backupDirectoryName(pluginDirectory(name)));
    await mkdir(backupDirectory, { recursive: true });
    if (existsSync(target)) await rename(target, backup);
    try {
      await rename(source, target);
      return { target, backup };
    } catch (error) {
      if (existsSync(backup) && !existsSync(target)) {
        try {
          await rename(backup, target);
          if (audit) audit.rollbackOutcome = 'succeeded';
        } catch (rollbackError) {
          if (audit) audit.rollbackOutcome = 'failed';
          throw rollbackError;
        }
      }
      throw error;
    }
  }

  protected async rollbackActivation({ target, backup }: { target: string; backup: string }): Promise<void> {
    await rm(target, { recursive: true, force: true });
    if (existsSync(backup)) await rename(backup, target);
  }

  protected async isolateActivation(target: string): Promise<void> {
    if (!existsSync(target)) return;
    const directory = join(PluginService.PLUGIN_PATH, BACKUP_DIRECTORY);
    await mkdir(directory, { recursive: true });
    await rename(target, join(directory, `failed-${randomUUID()}`));
  }

  protected removeBackup(backup: string): Promise<void> {
    return rm(backup, { recursive: true, force: true });
  }
}
