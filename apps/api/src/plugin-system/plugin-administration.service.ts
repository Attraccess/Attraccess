import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { randomUUID } from 'crypto';

import {
  AdministrationAuditAction,
  auditSubjectKeyId,
  safeAuditOrigin,
  safeRequestedSpec,
} from '../audit/policies/administration';

import { AUDIT_RECORDER, AuditActor, AuditDetails, AuditRecorder } from '../audit/recorder/audit-event';

import { FileUpload } from '../common/types/file-upload.types';

import { AddPluginRegistryDto } from './dto/npm-plugin-request.dto';

import { InstalledNpmPlugin, NpmPluginAuditState, NpmPluginService } from './npm-plugin.service';

import { PluginService } from './plugin.service';

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

  install(packageName: string, spec: string, registryId?: string, planToken?: string, actor?: AuditActor) {
    return this.installWithAudit(actor, 'plugin.installed', packageName, spec, (state) =>
      this.npmPluginService.install(packageName, spec, registryId, state, planToken),
    );
  }

  /** Removes the package and the dependants the administrator approved, auditing each removed package. */
  async removePackageGraph(packageName: string, approvedDependants: string[], actor: AuditActor) {
    const removing = this.npmPluginService.removalPlan(packageName);
    await this.npmPluginService.removeInstalled(packageName, Boolean(actor), approvedDependants);
    for (const plugin of removing) await this.recordPackage(actor, 'plugin.removed', plugin);
    if (actor) this.pluginService.requestRestart();
  }

  async removeInstalled(packageName: string, actor: AuditActor) {
    const installed = this.npmPluginService.listInstalled().find((plugin) => plugin.name === packageName);
    await this.npmPluginService.removeInstalled(packageName, Boolean(actor));
    if (installed) await this.recordPackage(actor, 'plugin.removed', installed);
    if (actor) this.pluginService.requestRestart();
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
      pluginId,
      restartRequested: 1,
    });
    this.pluginService.requestRestart();
  }

  async uploadPlugin(file: FileUpload, actor: AuditActor) {
    const plugin = await this.pluginService.uploadPlugin(file, Boolean(actor));
    await this.record(actor, 'plugin.zip_uploaded', auditSubjectKeyId(plugin.name), 'plugin-package', {
      pluginName: plugin.name,
      pluginVersion: plugin.version,
      restartRequested: 1,
    });
    if (actor) this.pluginService.requestRestart();
    return plugin;
  }

  /** An npm-installed plugin is removed as a package; an uploaded one by deleting its directory. */
  async deletePlugin(pluginId: string, actor: AuditActor) {
    const plugin = PluginService.getManifestById(pluginId);
    const installed =
      this.npmPluginService.findInstalledByPluginId(pluginId) ??
      (plugin
        ? this.npmPluginService.listInstalled().find(({ installPath }) => installPath === plugin.pluginDirectory)
        : undefined);
    if (installed) {
      await this.npmPluginService.removeInstalled(installed.name, Boolean(actor));
      await this.recordPackage(actor, 'plugin.removed', installed);
      if (actor) this.pluginService.requestRestart();
      return;
    }
    await this.pluginService.deletePlugin(pluginId, Boolean(actor));
    await this.record(actor, 'plugin.zip_deleted', auditSubjectKeyId(plugin?.name ?? pluginId), 'plugin-package', {
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
  ) {
    const state: NpmPluginAuditState = {
      ...(actor?.id
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
      if (state.context && state.restartRequested) this.pluginService.requestRestart();
      return installed;
    } catch (error) {
      await this.record(actor, action, subjectId, 'plugin-package', lifecycle(), 'failed', state.context?.operationId);
      if (state.context && state.restartRequested) this.pluginService.requestRestart();
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
    if (!actor?.id) return;
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
