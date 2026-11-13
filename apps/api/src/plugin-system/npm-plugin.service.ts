import { Inject, Injectable, OnApplicationBootstrap, OnModuleInit, Optional } from '@nestjs/common';

import { AUDIT_RECORDER, auditActorOf, AuditRecorder } from '../audit/recorder/audit-event';
import { AuditQueryService } from '../audit/audit-query.service';

import { readAuditSettings } from '../audit/audit.config';

import { AuditQueryDto } from '../audit/dto/audit-query.dto';

import { auditSubjectKeyId } from '../audit/policies/administration';

import { SettingsStoreService } from '../settings/settings-store.service';

import { NpmInstallation } from './npm/installation';

import { NpmInstallationPlan } from './npm/installation-plan';

import { NpmPackageCatalog } from './npm/package-catalog';

import { NpmPackagePreparation } from './npm/package-preparation';

import { PluginClassificationService } from './plugin-classification.service';

import {
  InstalledNpmPlugin,
  InstalledNpmPluginVersion,
  MarketplacePlugin,
  NpmPluginAuditState,
  PluginInstallPlan,
  PluginUpdatePolicy,
  readInstalledNpmPlugins,
} from './npm/package-models';

import { NpmPluginState, recoverNpmPluginBackups } from './npm/plugin-state';

import { NpmRegistryAccess } from './npm/registry-access';

import { PluginService } from './plugin.service';

export {
  DEFAULT_PLUGIN_UPDATE_POLICY,
  InstalledNpmPlugin,
  InstalledNpmPluginVersion,
  MarketplacePlugin,
  MAX_CONFIGURED_REGISTRIES,
  NpmPluginAuditState,
  PluginInstallPlan,
  PluginUpdatePolicy,
  StoredRegistry,
} from './npm/package-models';

/**
 * Plugins installed from npm registries: registries, marketplace, installs, updates and removal. The work is done by
 * the npm collaborators it composes; it finishes activation audits after a restart.
 */
@Injectable()
export class NpmPluginService implements OnModuleInit, OnApplicationBootstrap {
  private readonly state: NpmPluginState;

  private readonly registries: NpmRegistryAccess;

  private readonly catalog: NpmPackageCatalog;

  private readonly plan: NpmInstallationPlan;

  private readonly installation: NpmInstallation;

  constructor(
    private readonly settings: SettingsStoreService,
    @Optional() classification?: PluginClassificationService,
    @Optional() @Inject(AUDIT_RECORDER) private readonly audit?: AuditRecorder,
    @Optional() private readonly auditQuery?: AuditQueryService,
  ) {
    this.state = new NpmPluginState(classification);
    this.registries = new NpmRegistryAccess(settings);
    this.catalog = new NpmPackageCatalog(this.registries, this.state);
    const preparation = new NpmPackagePreparation(this.registries, this.catalog, this.state);
    this.plan = new NpmInstallationPlan(this.registries, this.catalog, this.state, preparation);
    this.installation = new NpmInstallation(settings, this.registries, this.state, preparation, this.plan);
  }

  static async recoverBackups(): Promise<void> {
    await recoverNpmPluginBackups();
  }

  async onModuleInit(): Promise<void> {
    await recoverNpmPluginBackups();
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.audit || !this.auditQuery) return;
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
          const existing = await this.auditQuery.list(
            Object.assign(new AuditQueryDto(), {
              action: 'plugin.activation_completed',
              operationId: pending.operationId,
              limit: 1,
            }),
          );
          if (!existing.items.length) {
            const receipt = await this.audit.record({
              domain: 'administration',
              action: 'plugin.activation_completed',
              operationId: pending.operationId,
              actor: auditActorOf({ ...pending, id: pending.actorId }),
              subject: { type: 'plugin-package', id: auditSubjectKeyId(installed.name) },
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
        await this.state.mutateInstalls(async () => {
          const current = readInstalledNpmPlugins().find((item) => item.name === installed.name);
          if (current?.pendingAudit?.operationId !== pending.operationId) return;
          const { pendingAudit: completed, ...record } = current;
          void completed;
          await this.state.writeState(record, null);
        });
      } catch {
        /* Keep the correlation for a later startup if storage was unavailable. */
      }
    }
  }

  listRegistries(): ReturnType<NpmRegistryAccess['listRegistries']> {
    return this.registries.listRegistries();
  }

  addRegistry(input: Parameters<NpmRegistryAccess['addRegistry']>[0]): ReturnType<NpmRegistryAccess['addRegistry']> {
    return this.registries.addRegistry(input);
  }

  async removeRegistry(id: string): Promise<void> {
    return this.registries.removeRegistry(id);
  }

  async testRegistry(id: string): Promise<void> {
    return this.registries.testRegistry(id);
  }

  removalPlan(name: string): InstalledNpmPlugin[] {
    return this.catalog.removalPlan(name);
  }

  async removeInstalled(name: string, deferRestart = false, approvedDependants: string[] = []): Promise<void> {
    return this.catalog.removeInstalled(name, deferRestart, approvedDependants);
  }

  async packageMetadata(name: string, registryId?: string): Promise<unknown> {
    return this.catalog.packageMetadata(name, registryId);
  }

  async packageVersions(name: string, registryId?: string): Promise<string[]> {
    return this.catalog.packageVersions(name, registryId);
  }

  searchMarketplace(query: string, registryId?: string): ReturnType<NpmPackageCatalog['searchMarketplace']> {
    return this.catalog.searchMarketplace(query, registryId);
  }

  async marketplacePackage(name: string, registryId?: string): Promise<MarketplacePlugin> {
    return this.catalog.marketplacePackage(name, registryId);
  }

  async installedVersionCandidates(name: string): Promise<InstalledNpmPluginVersion[]> {
    return this.plan.installedVersionCandidates(name);
  }

  async installPlan(name: string, spec: string, registryId?: string): Promise<PluginInstallPlan> {
    return this.plan.installPlan(name, spec, registryId);
  }

  async install(
    name: string,
    spec: string,
    registryId?: string,
    audit?: NpmPluginAuditState,
    planToken?: string,
  ): Promise<InstalledNpmPlugin> {
    return this.installation.install(name, spec, registryId, audit, planToken);
  }

  async checkInstalled(name: string): Promise<InstalledNpmPlugin> {
    return this.installation.checkInstalled(name);
  }

  async checkAllInstalled(): Promise<InstalledNpmPlugin[]> {
    return this.installation.checkAllInstalled();
  }

  async replaceInstalled(
    name: string,
    version: string,
    approvedPermissionAdditions: string[] = [],
    approvedMajorVersion = false,
    audit?: NpmPluginAuditState,
    planToken?: string,
  ): Promise<InstalledNpmPlugin> {
    return this.installation.replaceInstalled(
      name,
      version,
      approvedPermissionAdditions,
      approvedMajorVersion,
      audit,
      planToken,
    );
  }

  async updateRequestedSpec(name: string, requestedSpec: string): Promise<InstalledNpmPlugin> {
    return this.installation.updateRequestedSpec(name, requestedSpec);
  }

  async updateOverride(
    name: string,
    updateOverride: InstalledNpmPlugin['updateOverride'],
  ): Promise<InstalledNpmPlugin> {
    return this.installation.updateOverride(name, updateOverride);
  }

  async updateVersionPolicy(
    name: string,
    requestedSpec: string,
    updateOverride: InstalledNpmPlugin['updateOverride'],
  ): Promise<InstalledNpmPlugin> {
    return this.installation.updateVersionPolicy(name, requestedSpec, updateOverride);
  }

  async getUpdatePolicy(): Promise<PluginUpdatePolicy> {
    return this.installation.getUpdatePolicy();
  }

  async setUpdatePolicy(patch: Partial<PluginUpdatePolicy>): Promise<PluginUpdatePolicy> {
    return this.installation.setUpdatePolicy(patch);
  }

  listInstalled(): InstalledNpmPlugin[] {
    return this.state.listInstalled();
  }

  findInstalledByPluginId(pluginId: string): InstalledNpmPlugin | undefined {
    return this.state.findInstalledByPluginId(pluginId);
  }
}
