import { existsSync, readFileSync } from 'fs';
import { readdir, rename, rm } from 'fs/promises';
import { join } from 'path';
import { auditSubjectKeyId } from '../audit/audit-administration-policy';
import { AuditQueryDto } from '../audit/audit-query.dto';
import { readAuditSettings } from '../audit/audit.config';
import { NpmPluginService } from './npm-plugin.service';
import {
  BACKUP_DIRECTORY,
  PluginTransaction,
  TRANSACTION_FILE,
  backupInstallPath,
  packageVersion,
  readInstalledNpmPlugins,
} from './npm-plugin.service.feature-definitions';
import { NpmPluginServiceRouteContext } from './npm-plugin.service.route-context';
import { PluginService } from './plugin.service';

function getImplementationClass(): typeof NpmPluginService {
  return require('./npm-plugin.service').NpmPluginService;
}

export abstract class NpmPluginBootstrapImplementation extends NpmPluginServiceRouteContext {
  async onModuleInit(): Promise<void> {
    await NpmPluginService.recoverBackups();
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.audit) return;
    const manifests = PluginService.getPluginsWithLoadStatus();
    for (const installed of readInstalledNpmPlugins()) {
      const pending = installed.pendingAudit;
      if (!pending) continue;
      const manifest = manifests.find((entry) => entry.name === installed.name && entry.version === installed.version);
      const quarantined =
        installed.state === 'quarantined' || (manifest && PluginService.isPluginQuarantined(manifest));
      const loaded = manifest?.status === 'loaded' && !quarantined;
      if (!loaded && !quarantined && manifest?.status !== 'error') continue;
      try {
        const config = await readAuditSettings(this.settings);
        if (config.enabled && config.domains.includes('administration')) {
          const existing = await this.audit.list(
            Object.assign(new AuditQueryDto(), {
              action: 'plugin.activation_completed',
              operationId: pending.operationId,
              limit: 1,
            }),
          );
          if (!existing.items.length) {
            const receipt = await this.audit.recordAdministration({
              action: 'plugin.activation_completed',
              operationId: pending.operationId,
              actorId: pending.actorId,
              authenticationMethod: pending.authenticationMethod,
              apiTokenId: pending.apiTokenId,
              subjectType: 'plugin-package',
              subjectId: auditSubjectKeyId(installed.name),
              outcome: loaded ? 'succeeded' : 'failed',
              details: {
                ...pending.details,
                migrationOutcome: pending.migrationOutcome,
                activationOutcome: loaded ? 'succeeded' : 'quarantined',
                restartRequested: 1,
              },
            });
            if (receipt.status !== 'recorded') continue;
          }
        }
        // Clear only the operation observed above; a newer installation must retain its context.
        await this.mutateInstalls(async () => {
          const current = readInstalledNpmPlugins().find((item) => item.name === installed.name);
          if (current?.pendingAudit?.operationId !== pending.operationId) return;
          const { pendingAudit: completed, ...record } = current;
          void completed;
          await this.writeState(record, null);
        });
      } catch {
        /* Keep the correlation for a later startup if storage was unavailable. */
      }
    }
  }

  static async recoverBackups(): Promise<void> {
    if (!PluginService.PLUGIN_PATH) return;
    const backupDirectory = join(PluginService.PLUGIN_PATH, BACKUP_DIRECTORY);
    const journalPath = join(PluginService.PLUGIN_PATH, TRANSACTION_FILE);
    if (existsSync(journalPath)) {
      const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as PluginTransaction;
      const committed = JSON.stringify(readInstalledNpmPlugins()) === journal.after;
      for (const move of [...journal.moves].reverse()) {
        if (!/^npm-[A-Za-z0-9_-]+$/.test(move.installPath) || backupInstallPath(move.backupName) !== move.installPath)
          throw new Error('Invalid npm plugin transaction journal');
        const target = join(PluginService.PLUGIN_PATH, move.installPath);
        const backup = join(backupDirectory, move.backupName);
        if (committed) await rm(backup, { recursive: true, force: true });
        else if (existsSync(backup)) {
          await rm(target, { recursive: true, force: true });
          await rename(backup, target);
        } else if (!move.hadTarget) await rm(target, { recursive: true, force: true });
        if (!committed && move.quarantineError)
          PluginService.quarantinePluginDirectory(move.installPath, new Error(move.quarantineError));
      }
      await rm(journalPath, { force: true });
    }
    if (!existsSync(backupDirectory)) return;
    try {
      for (const entry of await readdir(backupDirectory, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const installPath = backupInstallPath(entry.name);
        if (!installPath) continue;

        const backup = join(backupDirectory, entry.name);
        const installed = readInstalledNpmPlugins().find((plugin) => plugin.installPath === installPath);
        if (!installed) {
          await rm(backup, { recursive: true, force: true });
          continue;
        }

        const target = join(PluginService.PLUGIN_PATH, installPath);
        const backupVersion = packageVersion(backup);
        const targetVersion = packageVersion(target);
        if (targetVersion === installed.version) {
          await rm(backup, { recursive: true, force: true });
        } else if (backupVersion !== installed.version) {
          getImplementationClass().recoveryLogger.error(
            `Cannot recover npm plugin backup for ${installed.name}: version does not match installation state`,
          );
        } else if (!existsSync(target)) {
          await rename(backup, target);
        } else {
          // State still references the backup version, so an interrupted replacement
          // must restore it instead of allowing newly activated code to take over.
          await rm(target, { recursive: true, force: true });
          await rename(backup, target);
        }
      }
      if ((await readdir(backupDirectory)).length === 0) await rm(backupDirectory, { recursive: true, force: true });
    } catch (error) {
      // A backup is deliberately retained if reconciliation cannot prove it stale.
      getImplementationClass().recoveryLogger.error('Failed to reconcile npm plugin backups', error);
      throw error;
    }
  }
}
