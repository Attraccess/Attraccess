import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';

import { randomUUID, createHash } from 'crypto';

import { existsSync, readFileSync } from 'fs';

import { mkdir, readdir, rename, rm, writeFile } from 'fs/promises';

import { join } from 'path';

import { safeAuditOrigin, safeRequestedSpec } from '../../audit/policies/administration';

import { PluginClassificationService } from '../plugin-classification.service';

import { PluginService } from '../plugin.service';

import { PendingNpmPluginAudit } from './audit-state';

import {
  BACKUP_DIRECTORY,
  InstalledNpmPlugin,
  NpmPluginAuditState,
  PluginFileMove,
  PluginTransaction,
  STATE_FILE,
  TRANSACTION_FILE,
  backupDirectoryName,
  backupInstallPath,
  packageVersion,
  pluginDirectory,
  readInstalledNpmPlugins,
} from './package-models';

const recoveryLogger = new Logger('NpmPluginService');

/**
 * Finishes or reverts an interrupted plugin transaction and reconciles leftover backups with the installation
 * state. Runs before plugins load.
 */
export async function recoverNpmPluginBackups(): Promise<void> {
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
        recoveryLogger.error(
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
    recoveryLogger.error('Failed to reconcile npm plugin backups', error);
    throw error;
  }
}

/** The installed npm plugins on disk: their state file, transaction journal, activations and backups. */
export class NpmPluginState {
  private installMutation = Promise.resolve();

  readonly classification: PluginClassificationService;

  constructor(classification?: PluginClassificationService) {
    this.classification = classification ?? new PluginClassificationService();
  }

  async writeState(installed: InstalledNpmPlugin, pendingAudit?: PendingNpmPluginAudit | null): Promise<void> {
    const previous = readInstalledNpmPlugins();
    const records = previous.filter(({ name }) => name !== installed.name);
    const pending =
      pendingAudit === undefined
        ? previous.find((plugin) => plugin.name === installed.name)?.pendingAudit
        : pendingAudit;
    const stored = { ...installed, ...(pending ? { pendingAudit: pending } : {}) };
    const statePath = join(PluginService.PLUGIN_PATH, STATE_FILE);
    const temporaryPath = `${statePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, JSON.stringify([...records, stored]));
      await rename(temporaryPath, statePath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  async writeTransaction(records: ReturnType<typeof readInstalledNpmPlugins>, moves: PluginFileMove[]): Promise<void> {
    const journalPath = join(PluginService.PLUGIN_PATH, TRANSACTION_FILE);
    // Refuse to overwrite an unfinished transaction, including cleanup failures.
    if (existsSync(journalPath))
      throw new BadRequestException('An unfinished plugin transaction must be recovered by restarting first.');
    const temporaryPath = `${journalPath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, JSON.stringify({ after: JSON.stringify(records), moves }), { flag: 'wx' });
      await rename(temporaryPath, journalPath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  async writeRecords(records: ReturnType<typeof readInstalledNpmPlugins>): Promise<void> {
    const statePath = join(PluginService.PLUGIN_PATH, STATE_FILE);
    const temporaryPath = `${statePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, JSON.stringify(records));
      await rename(temporaryPath, statePath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  async mutateInstalls<T>(operation: () => Promise<T>): Promise<T> {
    const mutation = this.installMutation.then(async () => {
      // Recovery compares the state with the journal's commit point. Any later
      // state change could make a committed tree look like an interrupted one.
      if (existsSync(join(PluginService.PLUGIN_PATH, TRANSACTION_FILE)))
        throw new BadRequestException('An unfinished plugin transaction must be recovered by restarting first.');
      return operation();
    });
    this.installMutation = mutation.then(
      () => undefined,
      () => undefined,
    );
    return mutation;
  }

  async activate(
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

  async rollbackActivation({ target, backup }: { target: string; backup: string }): Promise<void> {
    await rm(target, { recursive: true, force: true });
    if (existsSync(backup)) await rename(backup, target);
  }

  async isolateActivation(target: string): Promise<void> {
    if (!existsSync(target)) return;
    const directory = join(PluginService.PLUGIN_PATH, BACKUP_DIRECTORY);
    await mkdir(directory, { recursive: true });
    await rename(target, join(directory, `failed-${randomUUID()}`));
  }

  removeBackup(backup: string): Promise<void> {
    return rm(backup, { recursive: true, force: true });
  }

  pendingAudit(state?: NpmPluginAuditState): PendingNpmPluginAudit | undefined {
    if (!state?.context) return undefined;
    const { context, ...details } = state;
    return {
      ...context,
      migrationOutcome: 'pending-restart',
      details: {
        ...details,
        requestedSpec: safeRequestedSpec(state.requestedSpec),
        ...(state.registryUrl ? { registryUrl: safeAuditOrigin(state.registryUrl) } : {}),
      },
    };
  }

  async rollbackForAudit(activation: { target: string; backup: string }, audit?: NpmPluginAuditState) {
    try {
      await this.rollbackActivation(activation);
      if (audit) audit.rollbackOutcome = 'succeeded';
    } catch (error) {
      if (audit) audit.rollbackOutcome = 'failed';
      throw error;
    }
  }

  listInstalled(): InstalledNpmPlugin[] {
    return readInstalledNpmPlugins().map(({ pendingAudit, ...plugin }) => {
      void pendingAudit;
      const classification = this.classification.classify(plugin.name, plugin.registryUrl);
      return { ...plugin, classification: classification.kind, classificationReason: classification.reason };
    });
  }

  findInstalledByPluginId(pluginId: string): InstalledNpmPlugin | undefined {
    return this.listInstalled().find(
      ({ installPath }) => createHash('sha256').update(installPath).digest('base64url').slice(0, 21) === pluginId,
    );
  }

  async writeStateWithout(name: string): Promise<void> {
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

  installed(name: string): InstalledNpmPlugin {
    const installed = this.listInstalled().find((plugin) => plugin.name === name);
    if (!installed) throw new NotFoundException('Installed npm plugin not found');
    return installed;
  }
}
