import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { rm } from 'fs/promises';
import { join } from 'path';
import * as semver from 'semver';
import { NpmPluginRemovalImplementation } from './npm-plugin-removal';
import {
  InstalledNpmPlugin,
  PackageVersion,
  PluginInstallPlan,
  ResolvedPlugin,
  readInstalledNpmPlugins,
  registryPublisher,
} from './npm-plugin.service.feature-definitions';
import { resolvePluginDependencies } from './plugin-dependencies';
import { PluginService } from './plugin.service';
import type { NpmPluginService } from './npm-plugin.service';

export abstract class NpmPluginInstallPlanImplementation extends NpmPluginRemovalImplementation {
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
