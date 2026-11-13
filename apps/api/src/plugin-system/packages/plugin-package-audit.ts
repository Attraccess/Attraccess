import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';

import { randomUUID } from 'crypto';

import { AuditService } from '../../audit/audit.service';

import {
  auditSubjectKeyId,
  recordAdministrationSafely,
  safeAuditOrigin,
  safeRequestedSpec,
} from '../../audit/policies/administration';

import { InstalledNpmPlugin, NpmPluginAuditState } from '../npm-plugin.service';

import { PluginService } from '../plugin.service';

export const PLUGIN_SYSTEM_INSTANCE_ID = randomUUID();

/** The administration audit of plugin package changes made through the API, and installs wrapped in it. */
export class PluginPackageAudit {
  constructor(
    private readonly pluginService: PluginService,
    private readonly audit: AuditService,
  ) {}

  async installWithAudit(
    req: AuthenticatedRequest | undefined,
    action: string,
    packageName: string,
    requestedSpec: string,
    operation: (state: NpmPluginAuditState) => Promise<InstalledNpmPlugin>,
    before?: InstalledNpmPlugin,
  ) {
    const state: NpmPluginAuditState = {
      ...(req
        ? {
            context: {
              operationId: randomUUID(),
              actorId: req.user.id,
              authenticationMethod: req.user.authenticationMethod,
              apiTokenId: req.user.apiTokenId,
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
    try {
      const installed = await operation(state);
      if (req)
        await this.record(
          req,
          action,
          auditSubjectKeyId(packageName),
          'plugin-package',
          {
            ...this.lifecycleDetails(state),
            ...(state.registryUrl ? { registryUrl: safeAuditOrigin(state.registryUrl) } : {}),
          },
          installed.state === 'quarantined' ? 'failed' : 'succeeded',
          state.context?.operationId,
        );
      if (state.context && state.restartRequested) this.pluginService.requestRestart();
      return installed;
    } catch (error) {
      if (req)
        await this.record(
          req,
          action,
          auditSubjectKeyId(packageName),
          'plugin-package',
          {
            ...this.lifecycleDetails(state),
            ...(state.registryUrl ? { registryUrl: safeAuditOrigin(state.registryUrl) } : {}),
          },
          'failed',
          state.context?.operationId,
        );
      if (state.context && state.restartRequested) this.pluginService.requestRestart();
      throw error;
    }
  }

  private lifecycleDetails(state: NpmPluginAuditState): Record<string, string | number> {
    const { context, ...details } = state;
    void context;
    return details;
  }

  async recordPackage(req: AuthenticatedRequest, action: string, installed: InstalledNpmPlugin) {
    if (!req?.user) return;
    const removed = action === 'plugin.removed';
    await this.record(req, action, auditSubjectKeyId(installed.name), 'plugin-package', {
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

  async record(
    req: AuthenticatedRequest,
    action: string,
    subjectId: number,
    subjectType: string,
    details: Record<string, string | number>,
    outcome: 'succeeded' | 'failed' = 'succeeded',
    operationId?: string,
  ) {
    if (!req?.user) return;
    await recordAdministrationSafely(this.audit, {
      action,
      actorId: req.user.id,
      authenticationMethod: req.user.authenticationMethod,
      apiTokenId: req.user.apiTokenId,
      subjectType,
      subjectId,
      details,
      outcome,
      operationId,
    });
  }
}
