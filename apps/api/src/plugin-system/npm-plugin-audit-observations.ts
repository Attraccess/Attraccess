import { createHash } from 'crypto';
import { safeAuditOrigin, safeRequestedSpec } from '../audit/audit-administration-policy';
import { PendingNpmPluginAudit } from './npm-plugin-audit-state';
import { NpmPluginInstallTransactionImplementation } from './npm-plugin-install-transaction';
import {
  InstalledNpmPlugin,
  NpmPluginAuditState,
  readInstalledNpmPlugins,
} from './npm-plugin.service.feature-definitions';
export abstract class NpmPluginAuditStateImplementation extends NpmPluginInstallTransactionImplementation {
  protected pendingAudit(state?: NpmPluginAuditState): PendingNpmPluginAudit | undefined {
    if (!state?.context) return undefined;
    const { context, ...details } = state;
    return {
      ...context,
      migrationOutcome: 'pending-restart',
      details: {
        ...details,
        requestedSpec: safeRequestedSpec(state.requestedSpec),
        ...(state.registryUrl ? { registryUrl: safeAuditOrigin(state.registryUrl) } : {}),
      },
    };
  }

  protected async rollbackForAudit(activation: { target: string; backup: string }, audit?: NpmPluginAuditState) {
    try {
      await this.rollbackActivation(activation);
      if (audit) audit.rollbackOutcome = 'succeeded';
    } catch (error) {
      if (audit) audit.rollbackOutcome = 'failed';
      throw error;
    }
  }

  listInstalled(): InstalledNpmPlugin[] {
    return readInstalledNpmPlugins().map(({ pendingAudit, ...plugin }) => {
      void pendingAudit;
      const classification = this.classification.classify(plugin.name, plugin.registryUrl, plugin.publisher);
      return { ...plugin, classification: classification.kind, classificationReason: classification.reason };
    });
  }

  findInstalledByPluginId(pluginId: string): InstalledNpmPlugin | undefined {
    return this.listInstalled().find(
      ({ installPath }) => createHash('sha256').update(installPath).digest('base64url').slice(0, 21) === pluginId,
    );
  }
}
