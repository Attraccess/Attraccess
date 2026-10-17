import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleInit,
  Optional,
  BadRequestException,
} from '@nestjs/common';

import { AuditService } from '../audit/audit.service';

import { SettingsStoreService } from '../settings/settings-store.service';

import { PluginClassificationService } from './plugin-classification.service';

import { randomUUID, createHash } from 'crypto';

import { existsSync } from 'fs';

import { rename, rm, writeFile, mkdir } from 'fs/promises';

import { join } from 'path';

import { PendingNpmPluginAudit } from './npm/audit-state';

import {
  InstalledNpmPlugin,
  PluginFileMove,
  STATE_FILE,
  TRANSACTION_FILE,
  readInstalledNpmPlugins,
  BACKUP_DIRECTORY,
  NpmPluginAuditState,
  backupDirectoryName,
  pluginDirectory,
} from './npm/package-models';

import { PluginService } from './plugin.service';

import { safeAuditOrigin, safeRequestedSpec } from '../audit/policies/administration';

import { NpmInstallation } from './npm/installation';

export {
  DEFAULT_PLUGIN_UPDATE_POLICY,
  InstalledNpmPlugin,
  InstalledNpmPluginVersion,
  MarketplacePlugin,
  MAX_CONFIGURED_REGISTRIES,
  NpmPluginAuditState,
  PluginInstallPlan,
  PluginUpdatePolicy,
  StoredRegistry,
} from './npm/package-models';

@Injectable()
export class NpmPluginService extends NpmInstallation implements OnModuleInit, OnApplicationBootstrap {
  constructor(
    protected readonly settings: SettingsStoreService,
    @Optional() classification?: PluginClassificationService,
    @Optional() protected readonly audit?: AuditService,
  ) {
    super();
    this.classification = classification ?? new PluginClassificationService();
  }

  protected readonly logger = new Logger(NpmPluginService.name);

  protected registryMutation = Promise.resolve();

  protected installMutation = Promise.resolve();

  protected readonly classification: PluginClassificationService;

  protected async writeState(
    installed: InstalledNpmPlugin,
    pendingAudit?: PendingNpmPluginAudit | null,
  ): Promise<void> {
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

  protected async writeTransaction(
    records: ReturnType<typeof readInstalledNpmPlugins>,
    moves: PluginFileMove[],
  ): Promise<void> {
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

  protected async writeRecords(records: ReturnType<typeof readInstalledNpmPlugins>): Promise<void> {
    const statePath = join(PluginService.PLUGIN_PATH, STATE_FILE);
    const temporaryPath = `${statePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, JSON.stringify(records));
      await rename(temporaryPath, statePath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  protected async mutateInstalls<T>(operation: () => Promise<T>): Promise<T> {
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

  protected pendingAudit(state?: NpmPluginAuditState): PendingNpmPluginAudit | undefined {
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

  protected async rollbackForAudit(activation: { target: string; backup: string }, audit?: NpmPluginAuditState) {
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
      const classification = this.classification.classify(plugin.name, plugin.registryUrl, plugin.publisher);
      return { ...plugin, classification: classification.kind, classificationReason: classification.reason };
    });
  }

  findInstalledByPluginId(pluginId: string): InstalledNpmPlugin | undefined {
    return this.listInstalled().find(
      ({ installPath }) => createHash('sha256').update(installPath).digest('base64url').slice(0, 21) === pluginId,
    );
  }
}
