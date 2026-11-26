import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { randomUUID } from 'crypto';

import {
  AdministrationAuditAction,
  auditPluginIdentity,
  auditSubjectKeyId,
  safeAuditOrigin,
  safeRequestedSpec,
} from '../audit/policies/administration';

import {
  AUDIT_RECORDER,
  AuditActor,
  AuditDetails,
  AuditRecorder,
  SYSTEM_AUDIT_ACTOR,
} from '../audit/recorder/audit-event';

import { FileUpload } from '../common/types/file-upload.types';

import { resolvePluginChannel } from '../config/app.config';

import { AddPluginRegistryDto } from './dto/npm-plugin-request.dto';

import { InstalledNpmPlugin, NpmPluginAuditState, NpmPluginService } from './npm-plugin.service';

import { automaticUpdateRefusal } from './npm/package-models';

import { PluginService } from './plugin.service';

import { PluginUninstallService } from './plugin-uninstall.service';

type PluginAuditAction = Extract<AdministrationAuditAction, `plugin.${string}`>;

type PackageOverride = NonNullable<InstalledNpmPlugin['updateOverride']>;

/**
 * Plugin package, registry and lifecycle changes made by an administrator, and their audit. Without an actor
 * (an internal caller) nothing is audited and the restart stays with the caller, as for the HTTP routes.
 */
@Injectable()
export class PluginAdministrationService {
  constructor(
    private readonly pluginService: PluginService,
    private readonly pluginUninstall: PluginUninstallService,
    private readonly npmPluginService: NpmPluginService,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async setUpdatePolicy(body: Record<string, unknown>, actor: AuditActor) {
    const policy = await this.npmPluginService.setUpdatePolicy(body);
    await this.record(actor, 'plugin.update_policy_updated', 1, 'plugin-policy', {
      checksEnabled: policy.checksEnabled ? 1 : 0,
      updateMode: policy.mode,
      maintenanceStartMinute: policy.maintenanceWindow.startMinute,
      maintenanceDurationMinutes: policy.maintenanceWindow.durationMinutes,
      prerelease: policy.prerelease ? 1 : 0,
    });
    return policy;
  }

  async checkAllInstalled(actor: AuditActor) {
    const installed = await this.npmPluginService.checkAllInstalled();
    for (const plugin of installed) await this.recordPackage(actor, 'plugin.checked', plugin);
    return installed;
  }

  async checkInstalled(packageName: string, actor: AuditActor) {
    const installed = await this.npmPluginService.checkInstalled(packageName);
    await this.recordPackage(actor, 'plugin.checked', installed);
    return installed;
  }

  async updateRequestedSpec(packageName: string, requestedSpec: string, actor: AuditActor) {
    const installed = await this.npmPluginService.updateRequestedSpec(packageName, requestedSpec);
    await this.recordPackage(actor, 'plugin.spec_updated', installed);
    return installed;
  }

  async updateOverride(packageName: string, updateOverride: PackageOverride, actor: AuditActor) {
    const installed = await this.npmPluginService.updateOverride(packageName, updateOverride);
    await this.recordPackage(actor, 'plugin.update_override_updated', installed);
    return installed;
  }

  async updateVersionPolicy(
    packageName: string,
    requestedSpec: string,
    updateOverride: PackageOverride,
    actor: AuditActor,
  ) {
    const installed = await this.npmPluginService.updateVersionPolicy(packageName, requestedSpec, updateOverride);
    await this.recordPackage(actor, 'plugin.package_policy_updated', installed);
    return installed;
  }

  replaceInstalled(
    packageName: string,
    version: string,
    options: { approvedPermissionAdditions?: string[]; approvedMajorVersion?: boolean; planToken?: string },
    actor?: AuditActor,
  ) {
    const before = this.npmPluginService.listInstalled().find((plugin) => plugin.name === packageName);
    return this.installWithAudit(
      actor,
      'plugin.replaced',
      packageName,
      before?.requestedSpec ?? version,
      (state) =>
        this.npmPluginService.replaceInstalled(
          packageName,
          version,
          options.approvedPermissionAdditions ?? [],
          options.approvedMajorVersion === true,
          state,
          options.planToken,
        ),
      before,
    );
  }

  /**
   * An update the host installs on its own, audited as the system actor. It goes through the same replacement as a
   * manual one and approves nothing: no new permissions, no major version, no additional plugins. The restart is left
   * to the caller (`onRestartRequired`), so that one restart activates several updates.
   */
  applyAutomaticUpdate(packageName: string, version: string, onRestartRequired: () => void) {
    const before = this.npmPluginService.listInstalled().find((plugin) => plugin.name === packageName);
    return this.installWithAudit(
      SYSTEM_AUDIT_ACTOR,
      'plugin.replaced',
      packageName,
      before?.requestedSpec ?? version,
      async (state) => {
        await this.assertAutomaticUpdateSource(packageName, version, before);
        const plan = await this.npmPluginService.installPlan(packageName, version, before?.registryId);
        if (plan.plugins.some((plugin) => plugin.name !== packageName && plugin.action !== 'reuse'))
          throw new BadRequestException('The update needs other plugins installed or changed; install it manually');
        return this.npmPluginService.replaceInstalled(packageName, version, [], false, state, plan.token);
      },
      before,
      onRestartRequired,
    );
  }

  /** The check of the update offer, repeated right before an unattended install (see `automaticUpdateRefusal`). */
  private async assertAutomaticUpdateSource(packageName: string, version: string, before?: InstalledNpmPlugin) {
    if (!before) throw new NotFoundException('Plugin package is not installed');
    const candidate = (await this.npmPluginService.installedVersionCandidates(packageName)).find(
      (item) => item.version === version,
    );
    if (!candidate) throw new NotFoundException('Package version not found');
    const refusal = automaticUpdateRefusal(candidate, before);
    if (refusal) throw new BadRequestException(`${refusal}; install it manually`);
  }

  /** `recordAs` is the requested spec to remember when it differs from the `spec` that is installed. */
  install(
    packageName: string,
    spec: string | undefined,
    registryId?: string,
    planToken?: string,
    actor?: AuditActor,
    recordAs?: string,
  ) {
    const requestedSpec = recordAs ?? spec ?? resolvePluginChannel();
    return this.installWithAudit(actor, 'plugin.installed', packageName, requestedSpec, (state) =>
      this.npmPluginService.install(packageName, spec, registryId, state, planToken, recordAs),
    );
  }

  /** Removes the package and the dependants the administrator approved, auditing each removed package. */
  async removePackageGraph(packageName: string, approvedDependants: string[], actor?: AuditActor) {
    const removing = this.npmPluginService.removalPlan(packageName);
    const pluginNames = this.pluginNamesOf(removing);
    await this.npmPluginService.removeInstalled(packageName, Boolean(actor), approvedDependants);
    await this.clearHealthEntries(pluginNames);
    for (const plugin of removing) await this.recordPackage(actor, 'plugin.removed', plugin);
    if (actor) this.pluginService.requestRestart();
  }

  async removeInstalled(packageName: string, actor?: AuditActor) {
    const installed = this.npmPluginService.listInstalled().find((plugin) => plugin.name === packageName);
    const pluginNames = this.pluginNamesOf(installed ? [installed] : []);
    await this.npmPluginService.removeInstalled(packageName, Boolean(actor));
    await this.clearHealthEntries(pluginNames);
    if (installed) await this.recordPackage(actor, 'plugin.removed', installed);
    if (actor) this.pluginService.requestRestart();
  }

  /**
   * The plugin names the packages' manifests declare (not the package names). Read before the removal moves the
   * directories, so discovery still finds them.
   */
  private pluginNamesOf(packages: Array<Pick<InstalledNpmPlugin, 'installPath'>>): string[] {
    const directories = new Set(packages.map((plugin) => plugin.installPath));
    return PluginService.getDiscoveredPlugins()
      .filter((manifest) => directories.has(manifest.pluginDirectory))
      .map((manifest) => manifest.name);
  }

  /** The removed plugins' health entries go, so no door stays blocked by a plugin that is gone. */
  private async clearHealthEntries(pluginNames: string[]) {
    for (const name of pluginNames) await this.pluginUninstall.clearHealthEntries(name);
  }

  async addRegistry(body: AddPluginRegistryDto, actor: AuditActor) {
    const registry = await this.npmPluginService.addRegistry(body);
    await this.record(actor, 'plugin.registry_added', auditSubjectKeyId(registry.id), 'plugin-registry', {
      registryId: registry.id,
      registryName: registry.name,
      registryUrl: safeAuditOrigin(registry.url),
    });
    return registry;
  }

  async testRegistry(registryId: string, actor: AuditActor) {
    await this.npmPluginService.testRegistry(registryId);
    await this.record(actor, 'plugin.registry_tested', auditSubjectKeyId(registryId), 'plugin-registry', {
      registryId,
    });
  }

  async removeRegistry(registryId: string, actor: AuditActor) {
    await this.npmPluginService.removeRegistry(registryId);
    await this.record(actor, 'plugin.registry_removed', auditSubjectKeyId(registryId), 'plugin-registry', {
      registryId,
    });
  }

  async retryPlugin(pluginId: string, actor: AuditActor) {
    const plugin = PluginService.getManifestById(pluginId);
    if (!plugin) {
      throw new NotFoundException('Plugin not found');
    }
    if (!PluginService.isPluginQuarantined(plugin)) {
      throw new BadRequestException('Plugin is not disabled');
    }

    PluginService.clearPluginQuarantine(plugin.pluginDirectory);
    await this.record(actor, 'plugin.retry_requested', auditSubjectKeyId(plugin.name), 'plugin-package', {
      ...auditPluginIdentity(plugin),
      pluginId,
      restartRequested: 1,
    });
    this.pluginService.requestRestart();
  }

  async uploadPlugin(file: FileUpload, actor?: AuditActor) {
    const plugin = await this.pluginService.uploadPlugin(file, Boolean(actor));
    await this.record(actor, 'plugin.zip_uploaded', auditSubjectKeyId(plugin.name), 'plugin-package', {
      ...auditPluginIdentity(plugin),
      restartRequested: 1,
    });
    if (actor) this.pluginService.requestRestart();
    return plugin;
  }

  /** An npm-installed plugin is removed as a package; an uploaded one by deleting its directory. */
  async deletePlugin(pluginId: string, actor?: AuditActor) {
    const plugin = PluginService.getManifestById(pluginId);
    const installed =
      this.npmPluginService.findInstalledByPluginId(pluginId) ??
      (plugin
        ? this.npmPluginService.listInstalled().find(({ installPath }) => installPath === plugin.pluginDirectory)
        : undefined);
    if (installed) {
      const pluginNames = this.pluginNamesOf([installed]);
      await this.npmPluginService.removeInstalled(installed.name, Boolean(actor));
      await this.clearHealthEntries(pluginNames);
      await this.recordPackage(actor, 'plugin.removed', installed);
      if (actor) this.pluginService.requestRestart();
      return;
    }
    await this.pluginUninstall.deletePlugin(pluginId, Boolean(actor));
    await this.record(actor, 'plugin.zip_deleted', auditSubjectKeyId(plugin?.name ?? pluginId), 'plugin-package', {
      ...auditPluginIdentity(plugin),
      pluginId,
      restartRequested: 1,
    });
    if (actor) this.pluginService.requestRestart();
  }

  /**
   * Runs an install or replacement and records its lifecycle state (integrity, migration, activation,
   * rollback) as the operation filled it in, also when it fails. A restart it requested still happens.
   */
  private async installWithAudit(
    actor: AuditActor | undefined,
    action: PluginAuditAction,
    packageName: string,
    requestedSpec: string,
    operation: (state: NpmPluginAuditState) => Promise<InstalledNpmPlugin>,
    before?: InstalledNpmPlugin,
    restart: () => void = () => this.pluginService.requestRestart(),
  ) {
    const state: NpmPluginAuditState = {
      ...(actor
        ? {
            context: {
              operationId: randomUUID(),
              actorId: actor.id,
              authenticationMethod: actor.authenticationMethod ?? undefined,
              apiTokenId: actor.apiTokenId ?? undefined,
            },
          }
        : {}),
      packageName,
      requestedSpec: safeRequestedSpec(requestedSpec),
      ...(before ? { oldVersion: before.version } : {}),
      integrityResult: 'not-checked',
      provenanceResult: 'not-verified',
      migrationOutcome: 'not-run',
      activationOutcome: 'not-attempted',
      restartRequested: 0,
      rollbackOutcome: 'not-needed',
    };
    const lifecycle = () => ({
      ...lifecycleDetails(state),
      ...(state.registryUrl ? { registryUrl: safeAuditOrigin(state.registryUrl) } : {}),
    });
    const subjectId = auditSubjectKeyId(packageName);
    try {
      const installed = await operation(state);
      const outcome = installed.state === 'quarantined' ? 'failed' : 'succeeded';
      await this.record(actor, action, subjectId, 'plugin-package', lifecycle(), outcome, state.context?.operationId);
      if (state.context && state.restartRequested) restart();
      return installed;
    } catch (error) {
      await this.record(actor, action, subjectId, 'plugin-package', lifecycle(), 'failed', state.context?.operationId);
      if (state.context && state.restartRequested) restart();
      throw error;
    }
  }

  private async recordPackage(actor: AuditActor | undefined, action: PluginAuditAction, installed: InstalledNpmPlugin) {
    const removed = action === 'plugin.removed';
    await this.record(actor, action, auditSubjectKeyId(installed.name), 'plugin-package', {
      packageName: installed.name,
      ...(removed ? { oldVersion: installed.version } : { newVersion: installed.version }),
      requestedSpec: safeRequestedSpec(installed.requestedSpec),
      registryId: installed.registryId,
      registryUrl: safeAuditOrigin(installed.registryUrl),
      updateOverride: installed.updateOverride ?? 'inherit',
      ...(removed
        ? {
            activationOutcome: 'removed',
            restartRequested: 1,
            migrationOutcome: 'not-applicable',
            rollbackOutcome: 'not-needed',
            permissionAdditions: '[]',
            permissionRemovals: JSON.stringify(installed.permissions),
          }
        : {}),
      ...(installed.updateCheck
        ? { candidate: installed.updateCheck.candidate ?? '', checkState: installed.updateCheck.state }
        : {}),
    });
  }

  private async record(
    actor: AuditActor | undefined,
    action: PluginAuditAction,
    subjectId: number,
    subjectType: 'plugin-package' | 'plugin-registry' | 'plugin-policy',
    details: AuditDetails,
    outcome: 'succeeded' | 'failed' = 'succeeded',
    operationId?: string,
  ) {
    // Without an actor nothing is audited; the system actor (no user id) is one.
    if (!actor) return;
    await this.audit.record({
      domain: 'administration',
      action,
      ...(operationId ? { operationId } : {}),
      actor,
      subject: { type: subjectType, id: subjectId },
      outcome,
      details,
    });
  }
}

function lifecycleDetails(state: NpmPluginAuditState): AuditDetails {
  const { context, ...details } = state;
  void context;
  return details;
}
