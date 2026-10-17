import { BadRequestException, NotFoundException } from '@nestjs/common';

import { randomUUID } from 'crypto';

import { existsSync } from 'fs';

import { mkdir, rename, rm, writeFile } from 'fs/promises';

import { join } from 'path';

import {
  BACKUP_DIRECTORY,
  InstalledNpmPlugin,
  STATE_FILE,
  TRANSACTION_FILE,
  backupDirectoryName,
  readInstalledNpmPlugins,
  samePermissions,
  MarketplacePlugin,
  Registry,
  distIntegrity,
  packageName,
  packageProvenance,
  registryPublisher,
  repositoryUrl,
} from './package-models';

import { pluginRemovalClosure } from '../runtime/dependencies';

import { PluginService } from '../plugin.service';

import { parseNpmPluginPackage } from './contract-validation';

import { NpmRegistryAccess } from './registry-access';

export abstract class NpmPackageCatalog extends NpmRegistryAccess {
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
    // No hardcoded package list: official plugins are discovered through the same
    // keyword search as community plugins and classified by publisher and scope.
    const results = new Map(
      responses.flatMap(({ results }) => results).map((plugin) => [`${plugin.registry.id}:${plugin.name}`, plugin]),
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

  protected async searchRegistries(): Promise<Registry[]> {
    const registries = await this.storedRegistries();
    return Promise.all([this.registry(), ...registries.map((registry) => this.registry(registry.id))]);
  }

  protected marketplacePlugin(
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
        dependencies: pkg.attraccess.dependencies,
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
        dependencies: [],
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
}
