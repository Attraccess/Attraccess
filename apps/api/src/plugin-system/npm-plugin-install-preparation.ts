import { BadRequestException, NotFoundException } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { parseNpmPluginPackage } from './npm-plugin-contract';
import { NpmPluginUpdateCheckImplementation } from './npm-plugin-update-check';
import {
  InstalledNpmPlugin,
  NpmPluginAuditState,
  PackageVersion,
  PreparedPlugin,
  Registry,
  distIntegrity,
  extractTarball,
  pluginDirectory,
  registryPublisher,
  samePermissions,
  validateEntries,
  verifyIntegrity,
} from './npm-plugin.service.feature-definitions';
import { PluginMigrationService } from './plugin-migration.service';
import { LoadedPluginManifest } from './plugin.manifest';
import { PluginService } from './plugin.service';
export abstract class NpmPluginInstallPreparationImplementation extends NpmPluginUpdateCheckImplementation {
  protected async prepareInstallFromRegistry(
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
    audit?: NpmPluginAuditState,
  ): Promise<PreparedPlugin> {
    if (audit)
      Object.assign(audit, {
        newVersion: version,
        registryId: registry.id,
        registryUrl: registry.url,
        ...(replacing ? { oldVersion: replacing.version } : {}),
      });
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
    if (audit)
      Object.assign(audit, {
        integrityResult: 'verified',
        integrity: distIntegrity(packageVersion.dist),
      });
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

      if (audit)
        Object.assign(audit, {
          permissionAdditions: JSON.stringify(
            manifest.permissions.filter((permission) => !replacing?.permissions.includes(permission)),
          ),
          permissionRemovals: JSON.stringify(
            (replacing?.permissions ?? []).filter(
              (permission) => !manifest.permissions.some((value) => value === permission),
            ),
          ),
        });
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
      if (audit) audit.classification = classification.kind;
      const installed: InstalledNpmPlugin = {
        dependencies: manifest.dependencies ?? [],
        name,
        version,
        requestedSpec,
        registryId: registry.id,
        registryUrl: registry.url,
        integrity: distIntegrity(packageVersion.dist),
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
      return { installed, source, staging };
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      throw error;
    }
  }
}
