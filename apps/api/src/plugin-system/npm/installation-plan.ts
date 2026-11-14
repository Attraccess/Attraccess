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
  PluginInstallPlan,
  readInstalledNpmPlugins,
  ResolvedPlugin,
} from './package-models';

import { orderPluginDependencies, resolvePluginDependencies } from '../runtime/dependencies';

import { createHash } from 'crypto';

import { readFileSync } from 'fs';

import { rm } from 'fs/promises';

import { join } from 'path';

import { PluginService } from '../plugin.service';

import { NpmPackageCatalog } from './package-catalog';

import { NpmPackagePreparation } from './package-preparation';

import { NpmPluginState } from './plugin-state';

import { NpmRegistryAccess } from './registry-access';

/** The versions an installed package can move to, and the dependency plan of an install. */
export class NpmInstallationPlan {
  constructor(
    private readonly registry: NpmRegistryAccess,
    private readonly catalog: NpmPackageCatalog,
    private readonly state: NpmPluginState,
    private readonly preparation: NpmPackagePreparation,
  ) {}

  async installedVersionCandidates(name: string): Promise<InstalledNpmPluginVersion[]> {
    const installed = this.state.installed(name);
    const otherInstalled = this.state.listInstalled().filter((plugin) => plugin.name !== name);
    const metadata = (await this.catalog.packageMetadata(name, installed.registryId)) as {
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
          const { manifest } = parseNpmPluginPackage(pkg, this.catalog.hostVersion());
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

  private versionCandidate(
    installed: InstalledNpmPlugin,
    version: string,
    publishedAt: string | null,
    permissions: string[],
    publisher: string | null,
    pkg: NpmPluginPackage | null,
  ): InstalledNpmPluginVersion {
    const classification = this.state.classification.classify(installed.name, installed.registryUrl);
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

  async resolveVersion(
    name: string,
    spec: string,
    registry: Registry,
  ): Promise<{
    version: string;
    metadata: { versions?: Record<string, PackageVersion>; 'dist-tags'?: Record<string, string> };
  }> {
    const metadata = (await this.catalog.packageMetadata(name, registry.id)) as {
      versions?: Record<string, PackageVersion>;
      'dist-tags'?: Record<string, string>;
    };
    const version = metadata.versions?.[spec]
      ? spec
      : (metadata['dist-tags']?.[spec] ?? semver.maxSatisfying(Object.keys(metadata.versions ?? {}), spec));
    if (!version || !metadata.versions?.[version]) throw new NotFoundException('Package version not found');
    return { version, metadata };
  }

  async installPlan(name: string, spec: string, registryId?: string): Promise<PluginInstallPlan> {
    const registry = await this.registry.registry(registryId);
    const stateHash = createHash('sha256').update(JSON.stringify(readInstalledNpmPlugins())).digest('hex');
    const installed = this.state.listInstalled();
    const metadataCache = new Map<string, Awaited<ReturnType<NpmInstallationPlan['resolveVersion']>>['metadata']>();
    const pluginCache = new Map<string, ResolvedPlugin>();
    const { version, metadata } = await this.resolveVersion(name, spec, registry);
    metadataCache.set(name, metadata);
    const fromMetadata = async (
      packageName: string,
      version: string,
      metadata: Awaited<ReturnType<NpmInstallationPlan['resolveVersion']>>['metadata'],
    ): Promise<ResolvedPlugin> => {
      const key = JSON.stringify([packageName, version]);
      if (pluginCache.has(key)) return pluginCache.get(key);
      const published = metadata.versions?.[version] as PackageVersion & { attraccess?: unknown };
      let value: unknown = published;
      if (published?.attraccess === undefined) {
        // Distribution-only registries require inspecting the verified tarball
        // before dependency versions and permissions can be confirmed.
        const prepared = await this.preparation.prepareInstallFromRegistry(
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
      const details = this.catalog.marketplacePlugin(
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
        metadataCache.set(
          dependencyName,
          (await this.catalog.packageMetadata(dependencyName, registry.id)) as typeof metadata,
        );
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
}
