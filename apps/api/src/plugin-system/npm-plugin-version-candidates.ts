import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as semver from 'semver';
import { NpmPluginPackage, parseNpmPluginPackage } from './npm-plugin-contract';
import { NpmPluginInstallGraphImplementation } from './npm-plugin-install-graph';
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
} from './npm-plugin.service.feature-definitions';
import { orderPluginDependencies } from './plugin-dependencies';
export abstract class NpmPluginVersionCandidatesImplementation extends NpmPluginInstallGraphImplementation {
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
}
