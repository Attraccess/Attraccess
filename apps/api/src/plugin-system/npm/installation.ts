import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';

import { rm } from 'fs/promises';

import {
  InstalledNpmPlugin,
  NpmPluginAuditState,
  PackageVersion,
  Registry,
  PreparedPlugin,
  samePermissions,
  PluginUpdatePolicy,
  eligibleForPolicy,
  isDistTag,
  sameUpdatePolicy,
  DEFAULT_PLUGIN_UPDATE_POLICY,
  REGISTRY_PARENT,
  UPDATE_POLICY_KEY,
  normalizeUpdatePolicy,
  PluginInstallPlan,
  TRANSACTION_FILE,
  backupDirectoryName,
  readInstalledNpmPlugins,
} from './package-models';

import { createHash } from 'crypto';

import { orderPluginDependencies } from '../runtime/dependencies';

import { PluginService } from '../plugin.service';

import { existsSync } from 'fs';

import { join } from 'path';
import * as semver from 'semver';

import { NpmInstallationPlan } from './installation-plan';

import { NpmPackagePreparation } from './package-preparation';

import { NpmPluginState } from './plugin-state';

import { NpmRegistryAccess } from './registry-access';

import { SettingsStoreService } from '../../settings/settings-store.service';

/** Installing, replacing and checking npm plugins, and the update policy they follow. */
export class NpmInstallation {
  private readonly logger = new Logger('NpmPluginService');

  constructor(
    private readonly settings: SettingsStoreService,
    private readonly registry: NpmRegistryAccess,
    private readonly state: NpmPluginState,
    private readonly preparation: NpmPackagePreparation,
    private readonly plan: NpmInstallationPlan,
  ) {}

  async installGraph(
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
        const item = await this.preparation.prepareInstallFromRegistry(
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
      return await this.state.mutateInstalls(async () => {
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
            ...(installed.name === audit?.packageName && this.state.pendingAudit(audit)
              ? { pendingAudit: this.state.pendingAudit(audit) }
              : {}),
          })),
        ];
        const moves = prepared.map(({ installed }) => ({
          installPath: installed.installPath,
          backupName: backupDirectoryName(installed.installPath),
          hadTarget: existsSync(join(PluginService.PLUGIN_PATH, installed.installPath)),
          quarantineError: PluginService.pluginQuarantineError(installed.installPath),
        }));
        await this.state.writeTransaction(records, moves);
        try {
          for (const [index, item] of prepared.entries()) {
            activations.push(
              await this.state.activate(item.source, item.installed.name, audit, moves[index].backupName),
            );
            PluginService.clearPluginQuarantine(item.installed.installPath);
          }
          await this.state.writeRecords(records);
        } catch (error) {
          for (const activation of activations.reverse()) await this.state.rollbackForAudit(activation, audit);
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
            await this.state.removeBackup(backup);
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
    if (this.state.listInstalled().some((plugin) => plugin.name === name)) {
      throw new BadRequestException('Package is already installed; use the replacement endpoint');
    }
    const registry = await this.registry.registry(registryId);
    const { version, metadata } = await this.plan.resolveVersion(name, spec, registry);
    const plan = await this.plan.installPlan(name, version, registry.id);
    if (plan.plugins.length > 1) return this.installGraph(plan, registry, spec, undefined, [], audit, planToken);
    return this.installFromRegistry(name, version, registry, undefined, [], spec, metadata, audit);
  }

  async installFromRegistry(
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
    const { installed, source, staging } = await this.preparation.prepareInstallFromRegistry(
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
      return await this.state.mutateInstalls(async () => {
        if (!replacing && this.state.listInstalled().some((plugin) => plugin.name === name)) {
          throw new BadRequestException('Package is already installed; use the replacement endpoint');
        }
        orderPluginDependencies([...this.state.listInstalled().filter((plugin) => plugin.name !== name), installed]);
        if (replacing && this.state.installed(name).version !== replacing.version)
          throw new BadRequestException('Installed version changed; review again');
        if (audit) audit.activationOutcome = 'failed';
        const activation = await this.state.activate(source, name, audit);
        // Do not expose replacement code as active until its prior quarantine has
        // been removed. If that cleanup fails, this state remains safely disabled.
        const pendingActivation: InstalledNpmPlugin = {
          ...installed,
          state: 'quarantined',
          lastError: 'Plugin activation is pending quarantine cleanup.',
        };
        try {
          await this.state.writeState(pendingActivation, this.state.pendingAudit(audit));
        } catch (error) {
          await this.state.rollbackForAudit(activation, audit);
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
            await this.state.writeState(quarantined);
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
          await this.state.writeState(installed, this.state.pendingAudit(audit));
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
              await this.state.rollbackForAudit(activation, audit);
            } catch (rollbackError) {
              this.logger.error(`Failed to roll back installed package ${name}`, rollbackError);
              try {
                await this.state.isolateActivation(activation.target);
                // Removing the failed package makes the original backup eligible
                // for restoration. Do not restore its active record until this
                // retry has put the backup back at the discovery target.
                await this.state.rollbackForAudit(activation, audit);
              } catch (isolationError) {
                throw new AggregateError(
                  [error, quarantineError, rollbackError, isolationError],
                  `Failed to safely activate ${name}`,
                );
              }
            }
            try {
              if (replacing) await this.state.writeState(replacing, null);
              else await this.state.writeStateWithout(name);
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
          await this.state.removeBackup(activation.backup);
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

  async checkInstalled(name: string): Promise<InstalledNpmPlugin> {
    const installed = this.state.installed(name);
    let policy: PluginUpdatePolicy | undefined;
    const snapshotChanged = (current: InstalledNpmPlugin, currentPolicy?: PluginUpdatePolicy) =>
      current.version !== installed.version ||
      current.requestedSpec !== installed.requestedSpec ||
      current.registryId !== installed.registryId ||
      (policy !== undefined && currentPolicy !== undefined && !sameUpdatePolicy(currentPolicy, policy));
    try {
      policy = await this.getUpdatePolicy();
      if (!policy.checksEnabled) return installed;
      const candidates = await this.plan.installedVersionCandidates(name);
      const requested = isDistTag(installed.requestedSpec)
        ? await this.plan.resolveVersion(
            name,
            installed.requestedSpec,
            await this.registry.registry(installed.registryId),
          )
        : undefined;
      const updated = await this.state.mutateInstalls(async () => {
        const current = this.state.installed(name);
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
        await this.state.writeState(updated);
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
      const failed = await this.state.mutateInstalls(async () => {
        const current = this.state.installed(name);
        if (snapshotChanged(current, policy === undefined ? undefined : await this.getUpdatePolicy())) return null;
        const updated = {
          ...current,
          updateCheck,
        };
        await this.state.writeState(updated);
        return updated;
      });
      return failed ?? this.checkInstalled(name);
    }
  }

  async checkAllInstalled(): Promise<InstalledNpmPlugin[]> {
    const checked: InstalledNpmPlugin[] = [];
    const installs = this.state.listInstalled();
    for (let offset = 0; offset < installs.length; offset += 4) {
      const results = await Promise.allSettled(
        installs.slice(offset, offset + 4).map(({ name }) => this.checkInstalled(name)),
      );
      checked.push(...results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])));
    }
    return checked;
  }

  async replaceInstalled(
    name: string,
    version: string,
    approvedPermissionAdditions: string[] = [],
    approvedMajorVersion = false,
    audit?: NpmPluginAuditState,
    planToken?: string,
  ): Promise<InstalledNpmPlugin> {
    const installed = this.state.installed(name);
    const candidates = await this.plan.installedVersionCandidates(name);
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
    const registry = await this.registry.registry(installed.registryId);
    const plan = await this.plan.installPlan(name, version, registry.id);
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
      await this.registry.registry(installed.registryId),
      installed,
      approvedPermissionAdditions,
      installed.requestedSpec,
      undefined,
      audit,
    );
  }

  async updateRequestedSpec(name: string, requestedSpec: string): Promise<InstalledNpmPlugin> {
    const installed = this.state.installed(name);
    const registry = await this.registry.registry(installed.registryId);
    await this.plan.resolveVersion(name, requestedSpec, registry);
    return this.state.mutateInstalls(async () => {
      const updated = { ...this.state.installed(name), requestedSpec };
      await this.state.writeState(updated);
      return updated;
    });
  }

  async updateOverride(
    name: string,
    updateOverride: InstalledNpmPlugin['updateOverride'],
  ): Promise<InstalledNpmPlugin> {
    if (!['inherit', 'off', 'patch', 'minor', 'follow'].includes(updateOverride ?? ''))
      throw new BadRequestException('Invalid plugin update override');
    return this.state.mutateInstalls(async () => {
      const updated = { ...this.state.installed(name), updateOverride };
      await this.state.writeState(updated);
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
    const installed = this.state.installed(name);
    await this.plan.resolveVersion(name, requestedSpec, await this.registry.registry(installed.registryId));
    return this.state.mutateInstalls(async () => {
      const updated = { ...this.state.installed(name), requestedSpec, updateOverride };
      await this.state.writeState(updated);
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
    return this.state.mutateInstalls(async () => {
      const policy = normalizeUpdatePolicy({ ...(await this.getUpdatePolicy()), ...patch });
      await this.settings.setPlainSetting(REGISTRY_PARENT, UPDATE_POLICY_KEY, JSON.stringify(policy));
      return policy;
    });
  }
}
