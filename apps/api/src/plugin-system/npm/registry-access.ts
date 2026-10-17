import { BadRequestException, NotFoundException, Logger } from '@nestjs/common';

import axios from 'axios';

import { randomUUID } from 'crypto';

import {
  MAX_ARCHIVE_BYTES,
  MAX_CONFIGURED_REGISTRIES,
  MAX_METADATA_BYTES,
  REGISTRIES_KEY,
  REGISTRY_PARENT,
  Registry,
  StoredRegistry,
  normalizeRegistryUrl,
  validateRegistryDestination,
  zodRegistries,
  BACKUP_DIRECTORY,
  PluginTransaction,
  TRANSACTION_FILE,
  backupInstallPath,
  packageVersion,
  readInstalledNpmPlugins,
  InstalledNpmPlugin,
  InstalledNpmPluginVersion,
  MarketplacePlugin,
  NpmPluginAuditState,
  PackageVersion,
  PluginFileMove,
  PluginInstallPlan,
  PluginUpdatePolicy,
  PreparedPlugin,
} from './package-models';

import { existsSync, readFileSync } from 'fs';

import { readdir, rename, rm } from 'fs/promises';

import { join } from 'path';

import { auditSubjectKeyId } from '../../audit/policies/administration';

import { AuditQueryDto } from '../../audit/dto/audit-query.dto';

import { readAuditSettings } from '../../audit/audit.config';

import { NpmPluginService } from '../npm-plugin.service';

import { PluginService } from '../plugin.service';

import { AuditService } from '../../audit/audit.service';

import { SettingsStoreService } from '../../settings/settings-store.service';

import { PendingNpmPluginAudit } from './audit-state';

import { NpmPluginPackage } from './contract-validation';

import { PluginClassificationService } from '../plugin-classification.service';

function getImplementationClass(): typeof NpmPluginService {
  return require('../npm-plugin.service').NpmPluginService;
}

export abstract class NpmRegistryAccess {
  protected static readonly recoveryLogger = new Logger('NpmPluginService');

  async listRegistries(): Promise<Array<StoredRegistry & { tokenConfigured: boolean }>> {
    const registries = await this.storedRegistries();
    return Promise.all(
      registries.map(async (registry) => ({
        ...registry,
        tokenConfigured: (await this.settings.getSecretSetting(REGISTRY_PARENT, `${registry.id}:token`)).configured,
      })),
    );
  }

  async addRegistry(input: {
    name: string;
    url: string;
    token?: string | null;
  }): Promise<StoredRegistry & { tokenConfigured: boolean }> {
    const registry: StoredRegistry = {
      id: randomUUID(),
      name: input.name.trim(),
      url: normalizeRegistryUrl(input.url),
    };
    if (!registry.name) throw new BadRequestException('Registry name is required');
    await this.mutateRegistries(async (registries) => {
      if (registries.length >= MAX_CONFIGURED_REGISTRIES)
        throw new BadRequestException(`A maximum of ${MAX_CONFIGURED_REGISTRIES} registries can be configured`);
      if (registries.some(({ url }) => url === registry.url))
        throw new BadRequestException('Registry URL is already configured');
      if (input.token !== undefined)
        await this.settings.setSecretSetting(REGISTRY_PARENT, `${registry.id}:token`, input.token);
      try {
        await this.settings.setPlainSetting(REGISTRY_PARENT, REGISTRIES_KEY, JSON.stringify([...registries, registry]));
      } catch (error) {
        if (input.token !== undefined)
          await this.settings.setSecretSetting(REGISTRY_PARENT, `${registry.id}:token`, null);
        throw error;
      }
    });
    return { ...registry, tokenConfigured: input.token != null && input.token.trim().length > 0 };
  }

  async removeRegistry(id: string): Promise<void> {
    await this.mutateRegistries(async (registries) => {
      if (!registries.some((registry) => registry.id === id)) {
        // A prior removal may have persisted the registry change before token cleanup failed.
        await this.settings.setSecretSetting(REGISTRY_PARENT, `${id}:token`, null);
        return;
      }
      await this.settings.setPlainSetting(
        REGISTRY_PARENT,
        REGISTRIES_KEY,
        JSON.stringify(registries.filter((registry) => registry.id !== id)),
      );
      await this.settings.setSecretSetting(REGISTRY_PARENT, `${id}:token`, null);
    });
  }

  async testRegistry(id: string): Promise<void> {
    const registry = await this.registry(id);
    await this.getJson(`${registry.url}/-/ping`, registry);
  }

  protected async registry(id?: string): Promise<Registry> {
    if (!id || id === 'npm') return { id: 'npm', name: 'npm', url: 'https://registry.npmjs.org', token: null };
    const stored = (await this.storedRegistries()).find((registry) => registry.id === id);
    if (!stored) throw new NotFoundException('Registry not found');
    const { value: token } = await this.settings.getSecretSetting(REGISTRY_PARENT, `${id}:token`);
    return { ...stored, token };
  }

  protected async storedRegistries(): Promise<StoredRegistry[]> {
    const raw = await this.settings.getPlainSetting(REGISTRY_PARENT, REGISTRIES_KEY);
    if (!raw) return [];
    try {
      return zodRegistries(JSON.parse(raw));
    } catch {
      return [];
    }
  }

  protected async mutateRegistries(operation: (registries: StoredRegistry[]) => Promise<void>): Promise<void> {
    const mutation = this.registryMutation.then(async () => operation(await this.storedRegistries()));
    this.registryMutation = mutation.then(
      () => undefined,
      () => undefined,
    );
    return mutation;
  }

  protected async getJson(url: string, registry: Registry): Promise<unknown> {
    const target = new URL(url);
    const addresses = await validateRegistryDestination(target, registry);
    const response = await axios.get(target.toString(), {
      headers: registry.token ? { authorization: `Bearer ${registry.token}` } : undefined,
      timeout: 10_000,
      maxContentLength: MAX_METADATA_BYTES,
      maxRedirects: 0,
      lookup: (hostname, _options, callback) => {
        if (hostname !== target.hostname) return callback(new Error('Unexpected registry host'), '', 4);
        callback(null, addresses[0].address, addresses[0].family);
      },
    });
    return response.data;
  }

  protected async download(url: string, registry: Registry): Promise<Buffer> {
    let target = new URL(url);
    for (let redirects = 0; redirects <= 5; redirects += 1) {
      const addresses = await validateRegistryDestination(target, registry);
      const response = await axios.get<ArrayBuffer>(target.toString(), {
        responseType: 'arraybuffer',
        timeout: 30_000,
        maxContentLength: MAX_ARCHIVE_BYTES,
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
        headers: registry.token ? { authorization: `Bearer ${registry.token}` } : undefined,
        lookup: (hostname, _options, callback) => {
          if (hostname !== target.hostname) return callback(new Error('Unexpected tarball host'), '', 4);
          callback(null, addresses[0].address, addresses[0].family);
        },
      });
      if (response.status < 300) return Buffer.from(response.data);
      const location = response.headers.location;
      if (!location) throw new BadRequestException('Tarball redirect has no destination');
      target = new URL(location, target);
    }
    throw new BadRequestException('Tarball exceeded the redirect limit');
  }

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

  protected abstract readonly audit?: AuditService;

  protected abstract readonly settings: SettingsStoreService;

  protected abstract mutateInstalls<T>(operation: () => Promise<T>): Promise<T>;

  protected abstract writeState(
    installed: InstalledNpmPlugin,
    pendingAudit?: PendingNpmPluginAudit | null,
  ): Promise<void>;

  public abstract packageMetadata(name: string, registryId?: string): Promise<unknown>;

  protected abstract searchRegistries(): Promise<Registry[]>;

  public abstract marketplacePackage(name: string, registryId?: string): Promise<MarketplacePlugin>;

  protected abstract marketplacePlugin(
    value: unknown,
    registry: Registry,
    publisher?: string | null,
    resolvedName?: string,
  ): MarketplacePlugin;

  public abstract listInstalled(): InstalledNpmPlugin[];

  protected abstract resolveVersion(
    name: string,
    spec: string,
    registry: Registry,
  ): Promise<{
    version: string;
    metadata: { versions?: Record<string, PackageVersion>; 'dist-tags'?: Record<string, string> };
  }>;

  public abstract installPlan(name: string, spec: string, registryId?: string): Promise<PluginInstallPlan>;

  protected abstract installGraph(
    plan: PluginInstallPlan,
    registry: Registry,
    requestedSpec: string,
    replacing?: InstalledNpmPlugin,
    approvedPermissions?: string[],
    audit?: NpmPluginAuditState,
    planToken?: string,
  ): Promise<InstalledNpmPlugin>;

  protected abstract installFromRegistry(
    name: string,
    version: string,
    registry: Registry,
    replacing?: InstalledNpmPlugin,
    approvedPermissionAdditions?: string[],
    requestedSpec?: string,
    resolvedMetadata?: {
      versions?: Record<string, PackageVersion>;
      publisher?: unknown;
      _npmUser?: unknown;
      maintainers?: unknown;
    },
    audit?: NpmPluginAuditState,
  ): Promise<InstalledNpmPlugin>;

  protected abstract installed(name: string): InstalledNpmPlugin;

  public abstract removalPlan(name: string): InstalledNpmPlugin[];

  protected abstract writeTransaction(
    records: ReturnType<typeof readInstalledNpmPlugins>,
    moves: PluginFileMove[],
  ): Promise<void>;

  protected abstract writeStateWithout(name: string): Promise<void>;

  protected abstract writeRecords(records: ReturnType<typeof readInstalledNpmPlugins>): Promise<void>;

  protected abstract readonly logger: Logger;

  protected abstract removeBackup(backup: string): Promise<void>;

  protected abstract prepareInstallFromRegistry(
    name: string,
    version: string,
    registry: Registry,
    replacing?: InstalledNpmPlugin,
    approvedPermissionAdditions?: string[],
    requestedSpec?: string,
    resolvedMetadata?: {
      versions?: Record<string, PackageVersion>;
      publisher?: unknown;
      _npmUser?: unknown;
      maintainers?: unknown;
    },
    audit?: NpmPluginAuditState,
  ): Promise<PreparedPlugin>;

  protected abstract pendingAudit(state?: NpmPluginAuditState): PendingNpmPluginAudit | undefined;

  protected abstract activate(
    source: string,
    name: string,
    audit?: NpmPluginAuditState,
    backupName?: string,
  ): Promise<{ target: string; backup: string }>;

  protected abstract rollbackForAudit(
    activation: { target: string; backup: string },
    audit?: NpmPluginAuditState,
  ): Promise<void>;

  protected abstract hostVersion(): string;

  protected abstract versionCandidate(
    installed: InstalledNpmPlugin,
    version: string,
    publishedAt: string | null,
    permissions: string[],
    publisher: string | null,
    pkg: NpmPluginPackage | null,
  ): InstalledNpmPluginVersion;

  public abstract installedVersionCandidates(name: string): Promise<InstalledNpmPluginVersion[]>;

  public abstract getUpdatePolicy(): Promise<PluginUpdatePolicy>;

  public abstract checkInstalled(name: string): Promise<InstalledNpmPlugin>;

  protected abstract readonly classification: PluginClassificationService;

  protected abstract isolateActivation(target: string): Promise<void>;

  protected abstract rollbackActivation({ target, backup }: { target: string; backup: string }): Promise<void>;

  protected abstract registryMutation: Promise<void>;

  protected abstract installMutation: Promise<void>;
}
