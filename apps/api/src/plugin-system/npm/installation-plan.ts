import { BadRequestException, NotFoundException } from '@nestjs/common';

import * as semver from 'semver';

import { NpmPluginPackage, parseNpmPluginPackage } from './contract-validation';

import {
  InstalledNpmPlugin,
  InstalledNpmPluginVersion,
  PackageVersion,
  Registry,
  distIntegrity,
  matchesSpec,
  registryPublisher,
  repositoryUrl,
  semverImpact,
  NpmPluginAuditState,
  PluginInstallPlan,
  PreparedPlugin,
  TRANSACTION_FILE,
  backupDirectoryName,
  readInstalledNpmPlugins,
  samePermissions,
  ResolvedPlugin,
} from './package-models';

import { orderPluginDependencies, resolvePluginDependencies } from '../runtime/dependencies';

import { createHash } from 'crypto';

import { existsSync, readFileSync } from 'fs';

import { rm } from 'fs/promises';

import { join } from 'path';

import { PluginService } from '../plugin.service';

import { NpmPackageCatalog } from './package-catalog';

import { type NpmPluginService } from '../npm-plugin.service';

export abstract class NpmInstallationPlan extends NpmPackageCatalog {
  async installedVersionCandidates(name: string): Promise<InstalledNpmPluginVersion[]> {
    const installed = this.installed(name);
    const otherInstalled = this.listInstalled().filter((plugin) => plugin.name !== name);
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
          const graph = [...otherInstalled, { name, version, dependencies: manifest.dependencies }];
          // Missing dependencies can be resolved and confirmed in the update plan.
          // Existing versions and reverse constraints must already be compatible.
          const present = new Set(graph.map((plugin) => plugin.name));
          orderPluginDependencies(
            graph.map((plugin) => ({
              ...plugin,
              dependencies: plugin.dependencies?.filter((dependency) => present.has(dependency.name)),
            })),
          );
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

  protected versionCandidate(
    installed: InstalledNpmPlugin,
    version: string,
    publishedAt: string | null,
    permissions: string[],
    publisher: string | null,
    pkg: NpmPluginPackage | null,
  ): InstalledNpmPluginVersion {
    const classification = this.classification.classify(installed.name, installed.registryUrl, publisher);
    return {
      dependencies: pkg?.attraccess.dependencies ?? [],
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

  protected async resolveVersion(
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

  protected async installGraph(
    plan: PluginInstallPlan,
    registry: Registry,
    requestedSpec: string,
    replacing?: InstalledNpmPlugin,
    approvedPermissions: string[] = [],
    audit?: NpmPluginAuditState,
    planToken?: string,
  ): Promise<InstalledNpmPlugin> {
    if (planToken !== plan.token)
      throw new BadRequestException(
        'Dependency plan changed or requires confirmation. Review the plugin versions and permissions again.',
      );
    const before = JSON.stringify(readInstalledNpmPlugins());
    if (createHash('sha256').update(before).digest('hex') !== plan.stateHash)
      throw new BadRequestException('Installed plugins changed. Review the dependency plan again.');
    const prepared: PreparedPlugin[] = [];
    try {
      for (const plugin of plan.plugins.filter((plugin) => plugin.action !== 'reuse')) {
        const item = await this.prepareInstallFromRegistry(
          plugin.name,
          plugin.version,
          registry,
          plugin.action === 'replace' ? replacing : undefined,
          plugin.action === 'replace' ? approvedPermissions : [],
          plugin.name === plan.root ? requestedSpec : plugin.version,
          undefined,
          plugin.name === audit?.packageName ? audit : undefined,
        );
        prepared.push(item);
        if (
          JSON.stringify(item.installed.dependencies ?? []) !== JSON.stringify(plugin.dependencies) ||
          !samePermissions(item.installed.permissions, plugin.permissions) ||
          item.installed.integrity !== plugin.integrity ||
          item.installed.classification !== plugin.classification
        )
          throw new BadRequestException(`Package ${plugin.name} does not match its confirmed dependency plan`);
      }
      return await this.mutateInstalls(async () => {
        if (JSON.stringify(readInstalledNpmPlugins()) !== before)
          throw new BadRequestException('Installed plugins changed. Review the dependency plan again.');
        const activations: Array<{ target: string; backup: string }> = [];
        const quarantines = prepared.map(({ installed }) => ({
          directory: installed.installPath,
          error: PluginService.pluginQuarantineError(installed.installPath),
        }));
        const names = new Set(prepared.map(({ installed }) => installed.name));
        const records = [
          ...readInstalledNpmPlugins().filter(({ name }) => !names.has(name)),
          ...prepared.map(({ installed }) => ({
            ...installed,
            ...(installed.name === audit?.packageName && this.pendingAudit(audit)
              ? { pendingAudit: this.pendingAudit(audit) }
              : {}),
          })),
        ];
        const moves = prepared.map(({ installed }) => ({
          installPath: installed.installPath,
          backupName: backupDirectoryName(installed.installPath),
          hadTarget: existsSync(join(PluginService.PLUGIN_PATH, installed.installPath)),
          quarantineError: PluginService.pluginQuarantineError(installed.installPath),
        }));
        await this.writeTransaction(records, moves);
        try {
          for (const [index, item] of prepared.entries()) {
            activations.push(await this.activate(item.source, item.installed.name, audit, moves[index].backupName));
            PluginService.clearPluginQuarantine(item.installed.installPath);
          }
          await this.writeRecords(records);
        } catch (error) {
          for (const activation of activations.reverse()) await this.rollbackForAudit(activation, audit);
          for (const quarantine of quarantines)
            if (quarantine.error)
              PluginService.quarantinePluginDirectory(quarantine.directory, new Error(quarantine.error));
          await rm(join(PluginService.PLUGIN_PATH, TRANSACTION_FILE), { force: true });
          throw error;
        }
        // State is the commit point; startup can finish journal cleanup after a crash.
        try {
          await rm(join(PluginService.PLUGIN_PATH, TRANSACTION_FILE), { force: true });
        } catch (error) {
          this.logger.error('Failed to clear plugin transaction journal', error);
        }
        for (const { backup } of activations) {
          try {
            await this.removeBackup(backup);
          } catch (error) {
            this.logger.error('Failed to remove plugin backup', error);
          }
        }
        if (audit)
          Object.assign(audit, {
            activationOutcome: 'restart-requested',
            migrationOutcome: 'pending-restart',
            restartRequested: 1,
          });
        if (!audit?.context) new PluginService().requestRestart();
        return prepared.find(({ installed }) => installed.name === plan.root).installed;
      });
    } finally {
      for (const { staging } of prepared) await rm(staging, { recursive: true, force: true });
    }
  }

  async install(
    name: string,
    spec: string,
    registryId?: string,
    audit?: NpmPluginAuditState,
    planToken?: string,
  ): Promise<InstalledNpmPlugin> {
    if (this.listInstalled().some((plugin) => plugin.name === name)) {
      throw new BadRequestException('Package is already installed; use the replacement endpoint');
    }
    const registry = await this.registry(registryId);
    const { version, metadata } = await this.resolveVersion(name, spec, registry);
    const plan = await this.installPlan(name, version, registry.id);
    if (plan.plugins.length > 1) return this.installGraph(plan, registry, spec, undefined, [], audit, planToken);
    return this.installFromRegistry(name, version, registry, undefined, [], spec, metadata, audit);
  }

  async installPlan(name: string, spec: string, registryId?: string): Promise<PluginInstallPlan> {
    const registry = await this.registry(registryId);
    const stateHash = createHash('sha256').update(JSON.stringify(readInstalledNpmPlugins())).digest('hex');
    const installed = this.listInstalled();
    const metadataCache = new Map<string, Awaited<ReturnType<NpmPluginService['resolveVersion']>>['metadata']>();
    const pluginCache = new Map<string, ResolvedPlugin>();
    const { version, metadata } = await this.resolveVersion(name, spec, registry);
    metadataCache.set(name, metadata);
    const fromMetadata = async (
      packageName: string,
      version: string,
      metadata: Awaited<ReturnType<NpmPluginService['resolveVersion']>>['metadata'],
    ): Promise<ResolvedPlugin> => {
      const key = JSON.stringify([packageName, version]);
      if (pluginCache.has(key)) return pluginCache.get(key);
      const published = metadata.versions?.[version] as PackageVersion & { attraccess?: unknown };
      let value: unknown = published;
      if (published?.attraccess === undefined) {
        // Distribution-only registries require inspecting the verified tarball
        // before dependency versions and permissions can be confirmed.
        const prepared = await this.prepareInstallFromRegistry(
          packageName,
          version,
          registry,
          undefined,
          [],
          version,
          metadata,
        );
        try {
          value = { ...JSON.parse(readFileSync(join(prepared.source, 'package.json'), 'utf8')), dist: published.dist };
        } finally {
          await rm(prepared.staging, { recursive: true, force: true });
        }
      }
      const details = this.marketplacePlugin(
        value,
        registry,
        registryPublisher(published) ?? registryPublisher(metadata),
        packageName,
      );
      if (!details.installable) throw new BadRequestException(details.incompatibilityReason);
      if (details.name !== packageName || details.version !== version)
        throw new BadRequestException('Registry metadata identity does not match the dependency');
      const current = installed.find((plugin) => plugin.name === packageName);
      const resolved: ResolvedPlugin = {
        name: packageName,
        registryUrl: registry.url,
        version,
        displayName: details.displayName,
        permissions: details.permissions,
        dependencies: details.dependencies ?? [],
        integrity: details.integrity,
        classification: details.classification,
        action: current ? 'replace' : 'install',
      };
      pluginCache.set(key, resolved);
      return resolved;
    };
    const root = await fromMetadata(name, version, metadata);
    const existing: ResolvedPlugin[] = installed.map((plugin) => ({
      ...plugin,
      displayName: plugin.name,
      dependencies: plugin.dependencies ?? [],
      action: 'reuse',
      integrity: plugin.integrity,
    }));
    const dependencyMetadata = async (dependencyName: string) => {
      if (!metadataCache.has(dependencyName))
        metadataCache.set(dependencyName, (await this.packageMetadata(dependencyName, registry.id)) as typeof metadata);
      return metadataCache.get(dependencyName);
    };
    const plugins = await resolvePluginDependencies(root, existing, async function* (dependencyName, ranges) {
      const data = await dependencyMetadata(dependencyName);
      for (const version of Object.keys(data.versions ?? {})
        .filter((version) => semver.valid(version))
        .filter((version) => ranges.every((range) => semver.satisfies(version, range)))
        .sort(semver.rcompare)) {
        try {
          yield await fromMetadata(dependencyName, version, data);
        } catch {
          // Invalid releases are excluded, as with incompatible metadata.
        }
      }
    });
    for (const plugin of plugins.filter((plugin) => plugin.action === 'reuse')) {
      const current = installed.find(({ name }) => name === plugin.name);
      if (
        current.state === 'quarantined' ||
        PluginService.isPluginQuarantined({ pluginDirectory: current.installPath })
      )
        throw new BadRequestException(
          `Required plugin ${plugin.name} is disabled. Retry or repair it before installing its dependant.`,
        );
    }
    const token = createHash('sha256')
      .update(
        JSON.stringify({
          plugins,
          installed: installed
            .map(({ name, version, integrity, dependencies, state }) => ({
              name,
              version,
              integrity,
              dependencies,
              state,
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        }),
      )
      .digest('hex');
    return { root: name, stateHash, token, plugins };
  }

  protected installed(name: string): InstalledNpmPlugin {
    const installed = this.listInstalled().find((plugin) => plugin.name === name);
    if (!installed) throw new NotFoundException('Installed npm plugin not found');
    return installed;
  }
}
