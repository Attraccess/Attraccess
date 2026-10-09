import { BadRequestException, NotFoundException } from '@nestjs/common';

import { rm, mkdir, mkdtemp, writeFile } from 'fs/promises';

import {
  InstalledNpmPlugin,
  NpmPluginAuditState,
  PackageVersion,
  Registry,
  PreparedPlugin,
  distIntegrity,
  extractTarball,
  pluginDirectory,
  registryPublisher,
  samePermissions,
  validateEntries,
  verifyIntegrity,
  PluginUpdatePolicy,
  eligibleForPolicy,
  isDistTag,
  sameUpdatePolicy,
  DEFAULT_PLUGIN_UPDATE_POLICY,
  REGISTRY_PARENT,
  UPDATE_POLICY_KEY,
  normalizeUpdatePolicy,
} from './package-models';

import { orderPluginDependencies } from '../runtime/dependencies';

import { PluginService } from '../plugin.service';

import { existsSync, readFileSync } from 'fs';

import { join } from 'path';

import { parseNpmPluginPackage } from './contract-validation';

import { PluginMigrationService } from '../plugin-migration.service';

import { LoadedPluginManifest } from '../plugin.manifest';

import { resolveAppVersion } from '../../config/app.config';

import * as semver from 'semver';

import { NpmInstallationPlan } from './installation-plan';

export abstract class NpmInstallation extends NpmInstallationPlan {
  protected async installFromRegistry(
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
  ): Promise<InstalledNpmPlugin> {
    const { installed, source, staging } = await this.prepareInstallFromRegistry(
      name,
      version,
      registry,
      replacing,
      approvedPermissionAdditions,
      requestedSpec,
      resolvedMetadata,
      audit,
    );
    try {
      // Activation and its state update must commit together so a rollback cannot
      // remove another install's target or overwrite its state entry.
      return await this.mutateInstalls(async () => {
        if (!replacing && this.listInstalled().some((plugin) => plugin.name === name)) {
          throw new BadRequestException('Package is already installed; use the replacement endpoint');
        }
        orderPluginDependencies([...this.listInstalled().filter((plugin) => plugin.name !== name), installed]);
        if (replacing && this.installed(name).version !== replacing.version)
          throw new BadRequestException('Installed version changed; review again');
        if (audit) audit.activationOutcome = 'failed';
        const activation = await this.activate(source, name, audit);
        // Do not expose replacement code as active until its prior quarantine has
        // been removed. If that cleanup fails, this state remains safely disabled.
        const pendingActivation: InstalledNpmPlugin = {
          ...installed,
          state: 'quarantined',
          lastError: 'Plugin activation is pending quarantine cleanup.',
        };
        try {
          await this.writeState(pendingActivation, this.pendingAudit(audit));
        } catch (error) {
          await this.rollbackForAudit(activation, audit);
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
          if (audit) Object.assign(audit, { activationOutcome: 'quarantined', restartRequested: 1 });
          if (!audit?.context) new PluginService().requestRestart();
          return quarantined;
        }
        try {
          await this.writeState(installed, this.pendingAudit(audit));
        } catch (error) {
          // Discovery uses the npm record to find this installation, so restore
          // the real quarantine before returning this failed activation.
          this.logger.error(`Failed to activate installed package ${name}`, error);
          const message = error instanceof Error ? error.message : 'Unknown error';
          try {
            PluginService.quarantinePluginDirectory(
              installed.installPath,
              new Error(`Plugin activation could not be persisted: ${message}`),
            );
          } catch (quarantineError) {
            this.logger.error(`Failed to quarantine installed package ${name}`, quarantineError);
            try {
              await this.rollbackForAudit(activation, audit);
            } catch (rollbackError) {
              this.logger.error(`Failed to roll back installed package ${name}`, rollbackError);
              try {
                await this.isolateActivation(activation.target);
                // Removing the failed package makes the original backup eligible
                // for restoration. Do not restore its active record until this
                // retry has put the backup back at the discovery target.
                await this.rollbackForAudit(activation, audit);
              } catch (isolationError) {
                throw new AggregateError(
                  [error, quarantineError, rollbackError, isolationError],
                  `Failed to safely activate ${name}`,
                );
              }
            }
            try {
              if (replacing) await this.writeState(replacing, null);
              else await this.writeStateWithout(name);
            } catch (stateError) {
              throw new AggregateError(
                [error, quarantineError, stateError],
                `Failed to restore installation state for ${name}`,
              );
            }
          }
          throw error;
        }
        try {
          await this.removeBackup(activation.backup);
        } catch (error) {
          this.logger.error(`Failed to remove backup for ${name}`, error);
        }
        // Host migrations and runtime activation happen after restart, not during download.
        if (audit)
          Object.assign(audit, {
            activationOutcome: 'restart-requested',
            migrationOutcome: 'pending-restart',
            restartRequested: 1,
          });
        if (!audit?.context) new PluginService().requestRestart();
        return installed;
      });
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }

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

  protected hostVersion(): string {
    return resolveAppVersion();
  }

  async replaceInstalled(
    name: string,
    version: string,
    approvedPermissionAdditions: string[] = [],
    approvedMajorVersion = false,
    audit?: NpmPluginAuditState,
    planToken?: string,
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
    const registry = await this.registry(installed.registryId);
    const plan = await this.installPlan(name, version, registry.id);
    if (plan.plugins.length > 1)
      return this.installGraph(
        plan,
        registry,
        installed.requestedSpec,
        installed,
        approvedPermissionAdditions,
        audit,
        planToken,
      );
    return this.installFromRegistry(
      name,
      version,
      await this.registry(installed.registryId),
      installed,
      approvedPermissionAdditions,
      installed.requestedSpec,
      undefined,
      audit,
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
}
