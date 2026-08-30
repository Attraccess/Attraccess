import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit, Optional } from '@nestjs/common';
import axios from 'axios';
import { createHash, randomUUID } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { lookup } from 'dns/promises';
import { mkdir, mkdtemp, readdir, rename, rm, writeFile } from 'fs/promises';
import ipaddr from 'ipaddr.js';
import { join } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import * as tar from 'tar';
import { SettingsStoreService } from '../settings/settings-store.service';
import { resolveAppVersion } from '../config/app.config';
import { PluginService } from './plugin.service';
import { NpmPluginPackage, parseNpmPluginPackage } from './npm-plugin-contract';
import { PluginMigrationService } from './plugin-migration.service';
import { LoadedPluginManifest } from './plugin.manifest';
import * as semver from 'semver';
import { PluginClassificationService } from './plugin-classification.service';

const REGISTRY_PARENT = 'plugin-registry';
const REGISTRIES_KEY = 'registries';
const UPDATE_POLICY_KEY = 'update-policy';
const STATE_FILE = '.npm-plugin-state.json';
const BACKUP_DIRECTORY = '.npm-backups';
const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
const MAX_METADATA_BYTES = 10 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 200 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 10_000;
export const MAX_CONFIGURED_REGISTRIES = 5;

export type StoredRegistry = { id: string; name: string; url: string };
type Registry = StoredRegistry & { token: string | null };
type PackageVersion = { version: string; dist: { tarball: string; integrity?: string; shasum?: string } };

export type InstalledNpmPluginVersion = {
  version: string;
  publishedAt: string | null;
  direction: 'current' | 'newer' | 'older';
  compatible: boolean;
  reason: string | null;
  permissions: string[];
  permissionAdditions: string[];
  permissionRemovals: string[];
  classification: 'official' | 'community';
  classificationReason: string;
  deprecated: string | null;
  integrity: string | null;
  repository: string | null;
  homepage: string | null;
  semverImpact: 'major' | 'minor' | 'patch' | 'prerelease' | 'none';
  matchesRequestedSpec: boolean;
};

export type PluginUpdatePolicy = {
  checksEnabled: boolean;
  mode: 'off' | 'patch' | 'minor' | 'follow';
  maintenanceWindow: { startMinute: number; durationMinutes: number };
  prerelease: boolean;
};

export const DEFAULT_PLUGIN_UPDATE_POLICY: PluginUpdatePolicy = {
  checksEnabled: true,
  mode: 'minor',
  maintenanceWindow: { startMinute: 180, durationMinutes: 120 },
  prerelease: false,
};

export type InstalledNpmPlugin = {
  name: string;
  version: string;
  requestedSpec: string;
  registryId: string;
  registryUrl: string;
  integrity: string;
  installPath: string;
  permissions: string[];
  compatibility: {
    host: string;
    sdk: { backend?: string; frontend?: string };
  };
  state: 'active' | 'quarantined';
  installedAt: string;
  activatedAt: string;
  lastError: string | null;
  classification: 'official' | 'community';
  classificationReason: string;
  publisher: string | null;
  updateOverride?: 'inherit' | 'off' | 'patch' | 'minor' | 'follow';
  updateCheck?: {
    checkedAt: string;
    candidate: string | null;
    state: 'up-to-date' | 'available' | 'blocked' | 'failed';
    error: string | null;
  };
  knownGoodVersion?: string | null;
};

export type MarketplacePlugin = {
  name: string;
  version: string | null;
  displayName: string | null;
  description: string | null;
  permissions: string[];
  hostRange: string | null;
  sdkCompatibility: { backend: string | null; frontend: string | null };
  repository: string | null;
  homepage: string | null;
  license: string | null;
  publisher: string | null;
  deprecated: boolean;
  registry: StoredRegistry;
  classification: 'official' | 'community';
  classificationReason: string;
  installable: boolean;
  incompatibilityReason: string | null;
  integrity: string | null;
  provenance: string | null;
};

@Injectable()
export class NpmPluginService implements OnModuleInit {
  private readonly logger = new Logger(NpmPluginService.name);
  private static readonly recoveryLogger = new Logger(NpmPluginService.name);
  private registryMutation = Promise.resolve();
  private installMutation = Promise.resolve();

  constructor(
    private readonly settings: SettingsStoreService,
    @Optional() classification?: PluginClassificationService,
  ) {
    this.classification = classification ?? new PluginClassificationService();
  }

  private readonly classification: PluginClassificationService;

  async onModuleInit(): Promise<void> {
    await NpmPluginService.recoverBackups();
  }

  static async recoverBackups(): Promise<void> {
    if (!PluginService.PLUGIN_PATH) return;
    const backupDirectory = join(PluginService.PLUGIN_PATH, BACKUP_DIRECTORY);
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
          NpmPluginService.recoveryLogger.error(
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
      NpmPluginService.recoveryLogger.error('Failed to reconcile npm plugin backups', error);
      throw error;
    }
  }

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

  async packageMetadata(name: string, registryId?: string): Promise<unknown> {
    const registry = await this.registry(registryId);
    return this.getJson(`${registry.url}/${encodeURIComponent(name)}`, registry);
  }

  async packageVersions(name: string, registryId?: string): Promise<string[]> {
    const metadata = (await this.packageMetadata(name, registryId)) as { versions?: Record<string, unknown> };
    return Object.keys(metadata.versions ?? {}).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  }

  async searchMarketplace(
    query: string,
    registryId?: string,
  ): Promise<{ results: MarketplacePlugin[]; errors: string[] }> {
    const registries = registryId ? [await this.registry(registryId)] : await this.searchRegistries();
    const responses = await Promise.all(
      registries.map(async (registry) => {
        try {
          const search = (await this.getJson(
            `${registry.url}/-/v1/search?text=${encodeURIComponent(`keywords:attraccess-plugin ${query.trim()}`)}&size=20`,
            registry,
          )) as { objects?: Array<{ package?: unknown }> };
          return {
            results: (
              await Promise.allSettled(
                (search.objects ?? []).map(async ({ package: pkg }) => {
                  const summary = pkg as { name?: unknown };
                  return typeof summary?.name === 'string'
                    ? this.marketplacePackage(summary.name, registry.id)
                    : this.marketplacePlugin(pkg, registry);
                }),
              )
            ).flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])),
            error: null,
          };
        } catch {
          return { results: [], error: `Could not search ${registry.name}` };
        }
      }),
    );
    const normalizedQuery = query.trim().toLowerCase();
    const officialResults =
      !registryId || registryId === 'npm'
        ? await Promise.allSettled(
            this.classification
              .officialPackages()
              .filter(({ name }) => !normalizedQuery || name.toLowerCase().includes(normalizedQuery))
              .map(({ name }) => this.marketplacePackage(name)),
          )
        : [];
    const results = new Map(
      [
        ...responses.flatMap(({ results }) => results),
        ...officialResults.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])),
      ].map((plugin) => [`${plugin.registry.id}:${plugin.name}`, plugin]),
    );
    return {
      results: [...results.values()],
      errors: responses.flatMap(({ error }) => (error ? [error] : [])),
    };
  }

  async marketplacePackage(name: string, registryId?: string): Promise<MarketplacePlugin> {
    const registry = await this.registry(registryId);
    const metadata = (await this.packageMetadata(name, registry.id)) as {
      name?: string;
      'dist-tags'?: { latest?: string };
      versions?: Record<string, unknown>;
    };
    if (metadata.name && metadata.name !== name)
      throw new BadRequestException('Registry metadata identity does not match the requested package');
    const version = metadata['dist-tags']?.latest;
    const pkg = version ? metadata.versions?.[version] : undefined;
    if (!pkg) throw new NotFoundException('Package has no latest version');
    if (packageName(pkg) !== name)
      throw new BadRequestException('Registry metadata identity does not match the requested package');
    return this.marketplacePlugin(pkg, registry, registryPublisher(pkg) ?? registryPublisher(metadata), name);
  }

  async install(name: string, spec: string, registryId?: string): Promise<InstalledNpmPlugin> {
    if (this.listInstalled().some((plugin) => plugin.name === name)) {
      throw new BadRequestException('Package is already installed; use the replacement endpoint');
    }
    const registry = await this.registry(registryId);
    const { version, metadata } = await this.resolveVersion(name, spec, registry);
    return this.installFromRegistry(name, version, registry, undefined, [], spec, metadata);
  }

  async removeInstalled(name: string): Promise<void> {
    await this.mutateInstalls(async () => {
      const installed = this.installed(name);
      const target = join(PluginService.PLUGIN_PATH, installed.installPath);
      const backup = join(PluginService.PLUGIN_PATH, BACKUP_DIRECTORY, backupDirectoryName(installed.installPath));

      if (existsSync(target)) {
        await mkdir(join(PluginService.PLUGIN_PATH, BACKUP_DIRECTORY), { recursive: true });
        await rename(target, backup);
      }
      try {
        await this.writeStateWithout(name);
      } catch (error) {
        if (existsSync(backup) && !existsSync(target)) await rename(backup, target);
        throw error;
      }
      try {
        PluginService.clearPluginQuarantine(installed.installPath);
      } catch (error) {
        this.logger.error(`Failed to clear quarantine for removed package ${name}`, error);
      }

      try {
        await rm(backup, { recursive: true, force: true });
      } catch (error) {
        this.logger.error(`Failed to remove uninstalled package files for ${name}`, error);
      }
      // Data and secrets are deliberately retained. Removing them is a separate,
      // destructive recovery operation rather than part of package deactivation.
      new PluginService().requestRestart();
    });
  }

  async installedVersionCandidates(name: string): Promise<InstalledNpmPluginVersion[]> {
    const installed = this.installed(name);
    const metadata = (await this.packageMetadata(name, installed.registryId)) as {
      versions?: Record<string, unknown>;
      time?: Record<string, string>;
      publisher?: unknown;
      _npmUser?: unknown;
      maintainers?: unknown;
    };

    return Object.entries(metadata.versions ?? {})
      .filter(([version]) => semver.valid(version))
      .map(([version, pkg]) => {
        const publisher = registryPublisher(pkg) ?? registryPublisher(metadata) ?? installed.publisher;
        try {
          const { manifest } = parseNpmPluginPackage(pkg, this.hostVersion());
          if (manifest.name !== name)
            throw new BadRequestException('Package identity does not match the installed package');
          return this.versionCandidate(
            installed,
            version,
            metadata.time?.[version] ?? null,
            manifest.permissions,
            publisher,
            pkg as NpmPluginPackage,
          );
        } catch (error) {
          return {
            ...this.versionCandidate(installed, version, metadata.time?.[version] ?? null, [], publisher, null),
            compatible: false,
            reason: error instanceof Error ? error.message : 'Package metadata is invalid',
          };
        }
      })
      .sort((a, b) => semver.rcompare(a.version, b.version));
  }

  async replaceInstalled(
    name: string,
    version: string,
    approvedPermissionAdditions: string[] = [],
    approvedMajorVersion = false,
  ): Promise<InstalledNpmPlugin> {
    const installed = this.installed(name);
    const candidates = await this.installedVersionCandidates(name);
    const candidate = candidates.find((item) => item.version === version);
    if (!candidate) throw new NotFoundException('Package version not found');
    if (!candidate.compatible) throw new BadRequestException(candidate.reason ?? 'Package version is not compatible');
    if (semver.major(candidate.version) > semver.major(installed.version) && !approvedMajorVersion)
      throw new BadRequestException('Explicit approval is required for a major version update');
    if (!samePermissions(candidate.permissionAdditions, approvedPermissionAdditions)) {
      throw new BadRequestException(
        `Permission approval required for: ${candidate.permissionAdditions.join(', ') || 'none'}`,
      );
    }
    return this.installFromRegistry(
      name,
      version,
      await this.registry(installed.registryId),
      installed,
      approvedPermissionAdditions,
      installed.requestedSpec,
    );
  }

  async updateRequestedSpec(name: string, requestedSpec: string): Promise<InstalledNpmPlugin> {
    const installed = this.installed(name);
    const registry = await this.registry(installed.registryId);
    await this.resolveVersion(name, requestedSpec, registry);
    return this.mutateInstalls(async () => {
      const updated = { ...this.installed(name), requestedSpec };
      await this.writeState(updated);
      return updated;
    });
  }

  async updateOverride(
    name: string,
    updateOverride: InstalledNpmPlugin['updateOverride'],
  ): Promise<InstalledNpmPlugin> {
    if (!['inherit', 'off', 'patch', 'minor', 'follow'].includes(updateOverride ?? ''))
      throw new BadRequestException('Invalid plugin update override');
    return this.mutateInstalls(async () => {
      const updated = { ...this.installed(name), updateOverride };
      await this.writeState(updated);
      return updated;
    });
  }

  async updateVersionPolicy(
    name: string,
    requestedSpec: string,
    updateOverride: InstalledNpmPlugin['updateOverride'],
  ): Promise<InstalledNpmPlugin> {
    if (!['inherit', 'off', 'patch', 'minor', 'follow'].includes(updateOverride ?? ''))
      throw new BadRequestException('Invalid plugin update override');
    const installed = this.installed(name);
    await this.resolveVersion(name, requestedSpec, await this.registry(installed.registryId));
    return this.mutateInstalls(async () => {
      const updated = { ...this.installed(name), requestedSpec, updateOverride };
      await this.writeState(updated);
      return updated;
    });
  }

  async getUpdatePolicy(): Promise<PluginUpdatePolicy> {
    const raw = await this.settings.getPlainSetting(REGISTRY_PARENT, UPDATE_POLICY_KEY);
    if (!raw) return DEFAULT_PLUGIN_UPDATE_POLICY;
    try {
      return normalizeUpdatePolicy(JSON.parse(raw));
    } catch {
      return DEFAULT_PLUGIN_UPDATE_POLICY;
    }
  }

  async setUpdatePolicy(patch: Partial<PluginUpdatePolicy>): Promise<PluginUpdatePolicy> {
    return this.mutateInstalls(async () => {
      const policy = normalizeUpdatePolicy({ ...(await this.getUpdatePolicy()), ...patch });
      await this.settings.setPlainSetting(REGISTRY_PARENT, UPDATE_POLICY_KEY, JSON.stringify(policy));
      return policy;
    });
  }

  async checkInstalled(name: string): Promise<InstalledNpmPlugin> {
    const installed = this.installed(name);
    let policy: PluginUpdatePolicy | undefined;
    const snapshotChanged = (current: InstalledNpmPlugin, currentPolicy?: PluginUpdatePolicy) =>
      current.version !== installed.version ||
      current.requestedSpec !== installed.requestedSpec ||
      current.registryId !== installed.registryId ||
      (policy !== undefined && currentPolicy !== undefined && !sameUpdatePolicy(currentPolicy, policy));
    try {
      policy = await this.getUpdatePolicy();
      if (!policy.checksEnabled) return installed;
      const candidates = await this.installedVersionCandidates(name);
      const requested = isDistTag(installed.requestedSpec)
        ? await this.resolveVersion(name, installed.requestedSpec, await this.registry(installed.registryId))
        : undefined;
      const updated = await this.mutateInstalls(async () => {
        const current = this.installed(name);
        // Candidates and dist-tag resolutions belong to the snapshot used for the registry request.
        if (snapshotChanged(current, await this.getUpdatePolicy())) return null;
        const candidate = candidates.find(
          (item) =>
            item.direction === 'newer' &&
            item.compatible &&
            eligibleForPolicy(item, current, policy, requested?.version),
        );
        const blocked = candidates.some((item) => item.direction === 'newer' && item.compatible) && !candidate;
        const updated = {
          ...current,
          updateCheck: {
            checkedAt: new Date().toISOString(),
            candidate: candidate?.version ?? null,
            state: candidate ? ('available' as const) : blocked ? ('blocked' as const) : ('up-to-date' as const),
            error: null,
          },
        };
        await this.writeState(updated);
        return updated;
      });
      return updated ?? this.checkInstalled(name);
    } catch (error) {
      const updateCheck = {
        checkedAt: new Date().toISOString(),
        candidate: null,
        state: 'failed' as const,
        error: error instanceof Error ? error.message : 'Update check failed',
      };
      const failed = await this.mutateInstalls(async () => {
        const current = this.installed(name);
        if (snapshotChanged(current, policy === undefined ? undefined : await this.getUpdatePolicy())) return null;
        const updated = {
          ...current,
          updateCheck,
        };
        await this.writeState(updated);
        return updated;
      });
      return failed ?? this.checkInstalled(name);
    }
  }

  async checkAllInstalled(): Promise<InstalledNpmPlugin[]> {
    const checked: InstalledNpmPlugin[] = [];
    const installs = this.listInstalled();
    for (let offset = 0; offset < installs.length; offset += 4) {
      const results = await Promise.allSettled(
        installs.slice(offset, offset + 4).map(({ name }) => this.checkInstalled(name)),
      );
      checked.push(...results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])));
    }
    return checked;
  }

  private versionCandidate(
    installed: InstalledNpmPlugin,
    version: string,
    publishedAt: string | null,
    permissions: string[],
    publisher: string | null,
    pkg: NpmPluginPackage | null,
  ): InstalledNpmPluginVersion {
    const classification = this.classification.classify(installed.name, installed.registryUrl, publisher);
    return {
      version,
      publishedAt,
      direction: semver.eq(version, installed.version)
        ? 'current'
        : semver.gt(version, installed.version)
          ? 'newer'
          : 'older',
      compatible: true,
      reason: null,
      permissions,
      permissionAdditions: permissions.filter((permission) => !installed.permissions.includes(permission)),
      permissionRemovals: installed.permissions.filter((permission) => !permissions.includes(permission)),
      classification: classification.kind,
      classificationReason: classification.reason,
      deprecated:
        typeof (pkg as unknown as { deprecated?: unknown } | null)?.deprecated === 'string'
          ? (pkg as unknown as { deprecated: string }).deprecated
          : (pkg as unknown as { deprecated?: unknown } | null)?.deprecated === true
            ? 'Deprecated by publisher'
            : null,
      integrity: pkg ? distIntegrity(pkg) : null,
      repository: pkg ? repositoryUrl(pkg.repository) : null,
      homepage: pkg?.homepage ?? null,
      semverImpact: semverImpact(installed.version, version),
      matchesRequestedSpec: matchesSpec(version, installed.requestedSpec),
    };
  }

  private installed(name: string): InstalledNpmPlugin {
    const installed = this.listInstalled().find((plugin) => plugin.name === name);
    if (!installed) throw new NotFoundException('Installed npm plugin not found');
    return installed;
  }

  private async installFromRegistry(
    name: string,
    version: string,
    registry: Registry,
    replacing?: InstalledNpmPlugin,
    approvedPermissionAdditions: string[] = [],
    requestedSpec = version,
    resolvedMetadata?: {
      versions?: Record<string, PackageVersion>;
      publisher?: unknown;
      _npmUser?: unknown;
      maintainers?: unknown;
    },
  ): Promise<InstalledNpmPlugin> {
    const metadata =
      resolvedMetadata ??
      ((await this.packageMetadata(name, registry.id)) as {
        versions?: Record<string, PackageVersion>;
        publisher?: unknown;
        _npmUser?: unknown;
        maintainers?: unknown;
      });
    const packageVersion = metadata.versions?.[version];
    if (!packageVersion || packageVersion.version !== version) throw new NotFoundException('Package version not found');
    if (!packageVersion.dist.integrity && !packageVersion.dist.shasum)
      throw new BadRequestException('Registry did not provide tarball integrity metadata');

    const tarball = await this.download(packageVersion.dist.tarball, registry);
    verifyIntegrity(tarball, packageVersion.dist);
    await mkdir(PluginService.PLUGIN_PATH, { recursive: true });
    const staging = await mkdtemp(join(PluginService.PLUGIN_PATH, '.npm-staging-'));
    try {
      await extractTarball(tarball, staging);
      const source = join(staging, 'package');
      const packageJsonPath = join(source, 'package.json');
      if (!existsSync(packageJsonPath)) throw new BadRequestException('Tarball does not contain package/package.json');
      const { pkg, manifest } = parseNpmPluginPackage(
        JSON.parse(readFileSync(packageJsonPath, 'utf8')),
        this.hostVersion(),
      );
      if (manifest.name !== name || manifest.version !== version)
        throw new BadRequestException('Tarball package identity does not match the requested package');
      validateEntries(source, manifest);
      await writeFile(join(source, 'plugin.json'), JSON.stringify(manifest));

      if (replacing) {
        const permissionAdditions = manifest.permissions.filter(
          (permission) => !replacing.permissions.includes(permission),
        );
        if (!samePermissions(permissionAdditions, approvedPermissionAdditions)) {
          throw new BadRequestException(
            `Permission approval required for: ${permissionAdditions.join(', ') || 'none'}`,
          );
        }
        await PluginMigrationService.assertReplacementMigrationHistory(manifest as LoadedPluginManifest, source);
      }

      const publisher = registryPublisher(packageVersion) ?? registryPublisher(metadata);
      const classification = this.classification.classify(name, registry.url, publisher);
      const installed: InstalledNpmPlugin = {
        name,
        version,
        requestedSpec,
        registryId: registry.id,
        registryUrl: registry.url,
        integrity: packageVersion.dist.integrity ?? `sha1-${packageVersion.dist.shasum}`,
        installPath: pluginDirectory(name),
        permissions: manifest.permissions,
        compatibility: { host: pkg.attraccess.host, sdk: pkg.attraccess.sdk },
        state: 'active',
        installedAt: replacing?.installedAt ?? new Date().toISOString(),
        activatedAt: new Date().toISOString(),
        lastError: null,
        classification: classification.kind,
        classificationReason: classification.reason,
        publisher,
        updateOverride: replacing?.updateOverride ?? 'inherit',
        updateCheck: null,
        knownGoodVersion: replacing?.version ?? null,
      };
      // Activation and its state update must commit together so a rollback cannot
      // remove another install's target or overwrite its state entry.
      return await this.mutateInstalls(async () => {
        if (!replacing && this.listInstalled().some((plugin) => plugin.name === name)) {
          throw new BadRequestException('Package is already installed; use the replacement endpoint');
        }
        const activation = await this.activate(source, name);
        // Do not expose replacement code as active until its prior quarantine has
        // been removed. If that cleanup fails, this state remains safely disabled.
        const pendingActivation: InstalledNpmPlugin = {
          ...installed,
          state: 'quarantined',
          lastError: 'Plugin activation is pending quarantine cleanup.',
        };
        try {
          await this.writeState(pendingActivation);
        } catch (error) {
          await this.rollbackActivation(activation);
          throw error;
        }
        try {
          PluginService.clearPluginQuarantine(installed.installPath);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          const quarantined = {
            ...pendingActivation,
            lastError: `Plugin remains quarantined because quarantine cleanup failed: ${message}`,
          };
          this.logger.error(`Failed to clear quarantine for installed package ${name}`, error);
          try {
            await this.writeState(quarantined);
          } catch (stateError) {
            // The pending state was persisted before cleanup, so a later write
            // failure cannot make a quarantined package appear active.
            this.logger.error(`Failed to record quarantine cleanup failure for ${name}`, stateError);
          }
          new PluginService().requestRestart();
          return quarantined;
        }
        try {
          await this.writeState(installed);
        } catch (error) {
          // Keep the already-persisted pending state rather than exposing code as
          // active when its final state transition cannot be recorded.
          this.logger.error(`Failed to activate installed package ${name}`, error);
          throw error;
        }
        try {
          await this.removeBackup(activation.backup);
        } catch (error) {
          this.logger.error(`Failed to remove backup for ${name}`, error);
        }
        new PluginService().requestRestart();
        return installed;
      });
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }

  listInstalled(): InstalledNpmPlugin[] {
    return readInstalledNpmPlugins().map((plugin) => {
      const classification = this.classification.classify(plugin.name, plugin.registryUrl, plugin.publisher);
      return { ...plugin, classification: classification.kind, classificationReason: classification.reason };
    });
  }

  findInstalledByPluginId(pluginId: string): InstalledNpmPlugin | undefined {
    return this.listInstalled().find(
      ({ installPath }) => createHash('sha256').update(installPath).digest('base64url').slice(0, 21) === pluginId,
    );
  }

  private async searchRegistries(): Promise<Registry[]> {
    const registries = await this.storedRegistries();
    return Promise.all([this.registry(), ...registries.map((registry) => this.registry(registry.id))]);
  }

  private marketplacePlugin(
    value: unknown,
    registry: Registry,
    publisher = registryPublisher(value),
    resolvedName?: string,
  ): MarketplacePlugin {
    const fallback = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const name = resolvedName ?? packageName(fallback) ?? 'Unknown package';
    const version = typeof fallback.version === 'string' ? fallback.version : null;
    const classified = this.classification.classify(name, registry.url, publisher);
    try {
      const { pkg } = parseNpmPluginPackage(value, this.hostVersion());
      return {
        name: pkg.name,
        version: pkg.version,
        displayName: pkg.attraccess.displayName,
        description: pkg.attraccess.description ?? null,
        permissions: pkg.attraccess.permissions,
        hostRange: pkg.attraccess.host,
        sdkCompatibility: {
          backend: pkg.attraccess.sdk.backend ?? null,
          frontend: pkg.attraccess.sdk.frontend ?? null,
        },
        repository: repositoryUrl(pkg.repository),
        homepage: pkg.homepage ?? null,
        license: pkg.license ?? null,
        publisher,
        deprecated: Boolean((pkg as { deprecated?: unknown }).deprecated),
        registry: { id: registry.id, name: registry.name, url: registry.url },
        classification: classified.kind,
        classificationReason: classified.reason,
        installable: true,
        incompatibilityReason: null,
        integrity: distIntegrity(pkg),
        provenance: packageProvenance(pkg),
      };
    } catch (error) {
      return {
        name,
        version,
        displayName: null,
        description: null,
        permissions: [],
        hostRange: null,
        sdkCompatibility: { backend: null, frontend: null },
        repository: null,
        homepage: null,
        license: null,
        publisher,
        deprecated: Boolean(fallback.deprecated),
        registry: { id: registry.id, name: registry.name, url: registry.url },
        classification: classified.kind,
        classificationReason: classified.reason,
        installable: false,
        incompatibilityReason: error instanceof Error ? error.message : 'Package metadata is invalid',
        integrity: null,
        provenance: null,
      };
    }
  }

  private async activate(source: string, name: string): Promise<{ target: string; backup: string }> {
    const target = join(PluginService.PLUGIN_PATH, pluginDirectory(name));
    const backupDirectory = join(PluginService.PLUGIN_PATH, BACKUP_DIRECTORY);
    const backup = join(backupDirectory, backupDirectoryName(pluginDirectory(name)));
    await mkdir(backupDirectory, { recursive: true });
    if (existsSync(target)) await rename(target, backup);
    try {
      await rename(source, target);
      return { target, backup };
    } catch (error) {
      if (existsSync(backup) && !existsSync(target)) await rename(backup, target);
      throw error;
    }
  }

  private async rollbackActivation({ target, backup }: { target: string; backup: string }): Promise<void> {
    await rm(target, { recursive: true, force: true });
    if (existsSync(backup)) await rename(backup, target);
  }

  private removeBackup(backup: string): Promise<void> {
    return rm(backup, { recursive: true, force: true });
  }

  private async writeState(installed: InstalledNpmPlugin): Promise<void> {
    const records = this.listInstalled().filter(({ name }) => name !== installed.name);
    const statePath = join(PluginService.PLUGIN_PATH, STATE_FILE);
    const temporaryPath = `${statePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, JSON.stringify([...records, installed]));
      await rename(temporaryPath, statePath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  private async writeStateWithout(name: string): Promise<void> {
    const statePath = join(PluginService.PLUGIN_PATH, STATE_FILE);
    const temporaryPath = `${statePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, JSON.stringify(this.listInstalled().filter((plugin) => plugin.name !== name)));
      await rename(temporaryPath, statePath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  private async resolveVersion(
    name: string,
    spec: string,
    registry: Registry,
  ): Promise<{
    version: string;
    metadata: { versions?: Record<string, PackageVersion>; 'dist-tags'?: Record<string, string> };
  }> {
    const metadata = (await this.packageMetadata(name, registry.id)) as {
      versions?: Record<string, PackageVersion>;
      'dist-tags'?: Record<string, string>;
    };
    const version = metadata.versions?.[spec]
      ? spec
      : (metadata['dist-tags']?.[spec] ?? semver.maxSatisfying(Object.keys(metadata.versions ?? {}), spec));
    if (!version || !metadata.versions?.[version]) throw new NotFoundException('Package version not found');
    return { version, metadata };
  }

  private async registry(id?: string): Promise<Registry> {
    if (!id || id === 'npm') return { id: 'npm', name: 'npm', url: 'https://registry.npmjs.org', token: null };
    const stored = (await this.storedRegistries()).find((registry) => registry.id === id);
    if (!stored) throw new NotFoundException('Registry not found');
    const { value: token } = await this.settings.getSecretSetting(REGISTRY_PARENT, `${id}:token`);
    return { ...stored, token };
  }

  private async storedRegistries(): Promise<StoredRegistry[]> {
    const raw = await this.settings.getPlainSetting(REGISTRY_PARENT, REGISTRIES_KEY);
    if (!raw) return [];
    try {
      return zodRegistries(JSON.parse(raw));
    } catch {
      return [];
    }
  }

  private async mutateRegistries(operation: (registries: StoredRegistry[]) => Promise<void>): Promise<void> {
    const mutation = this.registryMutation.then(async () => operation(await this.storedRegistries()));
    this.registryMutation = mutation.then(
      () => undefined,
      () => undefined,
    );
    return mutation;
  }

  private async mutateInstalls<T>(operation: () => Promise<T>): Promise<T> {
    const mutation = this.installMutation.then(operation);
    this.installMutation = mutation.then(
      () => undefined,
      () => undefined,
    );
    return mutation;
  }

  private async getJson(url: string, registry: Registry): Promise<unknown> {
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

  private async download(url: string, registry: Registry): Promise<Buffer> {
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

  private hostVersion(): string {
    return resolveAppVersion();
  }
}

function normalizeRegistryUrl(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new BadRequestException('Registry URL must use HTTP(S)');
  return url.toString().replace(/\/$/, '');
}
function pluginDirectory(name: string): string {
  return `npm-${Buffer.from(name).toString('base64url')}`;
}
function backupDirectoryName(installPath: string): string {
  return `${installPath}-${randomUUID()}`;
}
function backupInstallPath(backupName: string): string | undefined {
  const match = /^(npm-[A-Za-z0-9_-]+)-[0-9a-f-]{36}$/.exec(backupName);
  return match?.[1];
}
function packageVersion(directory: string): string | undefined {
  try {
    const pkg = JSON.parse(readFileSync(join(directory, 'plugin.json'), 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : undefined;
  } catch {
    return undefined;
  }
}
function readInstalledNpmPlugins(): InstalledNpmPlugin[] {
  const statePath = join(PluginService.PLUGIN_PATH, STATE_FILE);
  if (!existsSync(statePath)) return [];
  try {
    const records = JSON.parse(readFileSync(statePath, 'utf8'));
    if (!Array.isArray(records)) return [];
    return records.map((record) => ({
      ...record,
      requestedSpec: record.requestedSpec ?? record.version,
      compatibility: record.compatibility ?? { host: 'unknown', sdk: {} },
      state: record.state ?? 'active',
      installedAt: record.installedAt ?? new Date(0).toISOString(),
      activatedAt: record.activatedAt ?? new Date(0).toISOString(),
      lastError: record.lastError ?? null,
      updateOverride: record.updateOverride ?? 'inherit',
      updateCheck: record.updateCheck ?? null,
      knownGoodVersion: record.knownGoodVersion ?? null,
    }));
  } catch {
    return [];
  }
}
function zodRegistries(value: unknown): StoredRegistry[] {
  if (!Array.isArray(value)) throw new Error();
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error();
    const item = entry as StoredRegistry;
    return { id: item.id, name: item.name, url: normalizeRegistryUrl(item.url) };
  });
}
function validateEntries(
  root: string,
  manifest: {
    main: {
      backend?: { directory: string; entryPoint: string };
      frontend?: { directory: string; entryPoint: string; styles?: string };
      migrations?: { directory: string; entryPoint: string };
    };
  },
): void {
  for (const entry of [manifest.main.backend, manifest.main.frontend, manifest.main.migrations]) {
    if (entry && !existsSync(join(root, entry.directory, entry.entryPoint)))
      throw new BadRequestException('Package declares an entry point that is not present');
  }
  if (
    manifest.main.frontend?.styles &&
    !existsSync(join(root, manifest.main.frontend.directory, manifest.main.frontend.styles))
  )
    throw new BadRequestException('Package declares styles that are not present');
}
function verifyIntegrity(buffer: Buffer, dist: PackageVersion['dist']): void {
  if (dist.integrity) {
    const match = /^(sha(?:256|384|512))-(.+)$/.exec(dist.integrity);
    if (!match || createHash(match[1]).update(buffer).digest('base64') !== match[2])
      throw new BadRequestException('Tarball integrity check failed');
    return;
  }
  if (createHash('sha1').update(buffer).digest('hex') !== dist.shasum)
    throw new BadRequestException('Tarball integrity check failed');
}

async function extractTarball(tarball: Buffer, destination: string): Promise<void> {
  let extractedBytes = 0;
  let entries = 0;
  await pipeline(
    Readable.from(tarball),
    tar.x({
      cwd: destination,
      gzip: true,
      strict: true,
      preservePaths: false,
      filter: (path, entry) => {
        if (
          !path.startsWith('package/') ||
          !safeArchivePath(path) ||
          !('type' in entry) ||
          !['File', 'Directory'].includes(entry.type)
        )
          throw new BadRequestException('Tarball contains an unsafe entry');
        entries += 1;
        extractedBytes += entry.size;
        if (entries > MAX_ARCHIVE_ENTRIES || extractedBytes > MAX_EXTRACTED_BYTES)
          throw new BadRequestException('Tarball exceeds extraction limits');
        return true;
      },
    }),
  );
}

async function validateRegistryDestination(
  url: URL,
  registry: Registry,
): Promise<Array<{ address: string; family: 4 | 6 }>> {
  if (
    url.protocol !== new URL(registry.url).protocol ||
    url.host !== new URL(registry.url).host ||
    url.username ||
    url.password
  )
    throw new BadRequestException('Tarball URL must use the configured registry origin');
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => ipaddr.parse(address).range() !== 'unicast'))
    throw new BadRequestException('Tarball URL must resolve only to public addresses');
  return addresses.map(({ address, family }) => ({ address, family: family as 4 | 6 }));
}

function safeArchivePath(value: string): boolean {
  return !value.startsWith('/') && !value.split('/').includes('..');
}

function samePermissions(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((permission) => right.includes(permission));
}

function semverImpact(current: string, target: string): InstalledNpmPluginVersion['semverImpact'] {
  if (!semver.valid(current) || !semver.valid(target) || semver.eq(current, target)) return 'none';
  const difference = semver.diff(current, target);
  if (difference === 'major' || difference === 'premajor') return 'major';
  if (difference === 'minor' || difference === 'preminor') return 'minor';
  if (semver.prerelease(target)) return 'prerelease';
  return 'patch';
}

function matchesSpec(version: string, spec: string, includePrerelease = false, resolvedVersion?: string): boolean {
  return version === resolvedVersion || version === spec || semver.satisfies(version, spec, { includePrerelease });
}

function normalizeUpdatePolicy(value: unknown): PluginUpdatePolicy {
  const candidate = value as Partial<PluginUpdatePolicy>;
  const mode = ['off', 'patch', 'minor', 'follow'].includes(candidate?.mode ?? '')
    ? (candidate.mode as PluginUpdatePolicy['mode'])
    : DEFAULT_PLUGIN_UPDATE_POLICY.mode;
  const startMinute = candidate?.maintenanceWindow?.startMinute;
  const durationMinutes = candidate?.maintenanceWindow?.durationMinutes;
  if (!Number.isInteger(startMinute) || startMinute < 0 || startMinute >= 24 * 60)
    throw new BadRequestException('Maintenance window start must be a minute of the day');
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 24 * 60)
    throw new BadRequestException('Maintenance window duration must be between 1 and 1440 minutes');
  return {
    checksEnabled:
      typeof candidate?.checksEnabled === 'boolean'
        ? candidate.checksEnabled
        : DEFAULT_PLUGIN_UPDATE_POLICY.checksEnabled,
    mode,
    prerelease:
      typeof candidate?.prerelease === 'boolean' ? candidate.prerelease : DEFAULT_PLUGIN_UPDATE_POLICY.prerelease,
    maintenanceWindow: { startMinute, durationMinutes },
  };
}

function eligibleForPolicy(
  candidate: InstalledNpmPluginVersion,
  installed: InstalledNpmPlugin,
  policy: PluginUpdatePolicy,
  resolvedRequestedVersion?: string,
): boolean {
  const override = installed.updateOverride ?? 'inherit';
  const checksEnabled = override !== 'off' && policy.checksEnabled;
  const mode = effectiveUpdateMode(policy.mode, override);
  if (!checksEnabled || mode === 'off' || candidate.deprecated || candidate.permissionAdditions.length > 0)
    return false;
  if (!policy.prerelease && semver.prerelease(candidate.version)) return false;
  if (candidate.semverImpact === 'major') return false;
  if (mode === 'patch') return candidate.semverImpact === 'patch';
  if (mode === 'minor') return candidate.semverImpact === 'patch' || candidate.semverImpact === 'minor';
  return matchesSpec(candidate.version, installed.requestedSpec, policy.prerelease, resolvedRequestedVersion);
}

function effectiveUpdateMode(
  globalMode: PluginUpdatePolicy['mode'],
  override: NonNullable<InstalledNpmPlugin['updateOverride']>,
): PluginUpdatePolicy['mode'] {
  if (override === 'inherit') return globalMode;
  return override;
}

function sameUpdatePolicy(left: PluginUpdatePolicy, right: PluginUpdatePolicy): boolean {
  return (
    left.checksEnabled === right.checksEnabled &&
    left.mode === right.mode &&
    left.prerelease === right.prerelease &&
    left.maintenanceWindow.startMinute === right.maintenanceWindow.startMinute &&
    left.maintenanceWindow.durationMinutes === right.maintenanceWindow.durationMinutes
  );
}

function isDistTag(spec: string): boolean {
  return !semver.valid(spec) && !semver.validRange(spec);
}

function repositoryUrl(value: string | { url: string } | undefined): string | null {
  return typeof value === 'string' ? value : (value?.url ?? null);
}

function registryPublisher(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const metadata = value as { publisher?: unknown; _npmUser?: unknown; maintainers?: unknown };
  const publisher = publisherName(metadata.publisher) ?? publisherName(metadata._npmUser);
  if (publisher) return publisher;
  if (!Array.isArray(metadata.maintainers)) return null;
  return metadata.maintainers.map(publisherName).find((name): name is string => name !== null) ?? null;
}

function publisherName(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;
  const { name, username } = value as { name?: unknown; username?: unknown };
  return typeof username === 'string' ? username : typeof name === 'string' ? name : null;
}

function distIntegrity(pkg: NpmPluginPackage): string | null {
  const dist = (pkg as NpmPluginPackage & { dist?: { integrity?: unknown; shasum?: unknown } }).dist;
  if (typeof dist?.integrity === 'string') return dist.integrity;
  return typeof dist?.shasum === 'string' ? `sha1-${dist.shasum}` : null;
}

function packageProvenance(pkg: NpmPluginPackage): string | null {
  const attestations = (pkg as NpmPluginPackage & { dist?: { attestations?: { url?: unknown } } }).dist?.attestations;
  return typeof attestations?.url === 'string' ? attestations.url : null;
}

function packageName(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const { name } = value as { name?: unknown };
  return typeof name === 'string' ? name : null;
}
