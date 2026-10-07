import { WagoAudit, wagoAuditSummary } from './wago-audit';
import { ConflictException } from '@nestjs/common';
import type { PluginAuditPrincipal } from '@attraccess/plugins-backend-sdk';
import {
  applyPreset,
  type WagoPresetApplication,
  type WagoConfigurationSnapshot,
  canonicalSnapshot,
  configurationDiff,
  configurationHash,
} from './configuration';
import { selectPresetChanges } from './configuration-editor';
import { WagoConfigurationDraft } from './wago-configuration-draft.entity';
import { applySelectedChanges } from './wago.helpers';
import { parsePresetProvenance } from './wago.helpers';
import { WagoServiceDraftForPresetOperation } from './wago.wago-service-draft-for-preset-operation';
export abstract class WagoServiceApplyPresetOperation extends WagoServiceDraftForPresetOperation {
  async applyPreset(
    controllerId: number,
    application: WagoPresetApplication,
    selectedPaths: string[],
    previewedDraftHash: string,
    snapshotOrPrincipal?: WagoConfigurationSnapshot | PluginAuditPrincipal,
    principal?: PluginAuditPrincipal,
  ): Promise<Pick<WagoConfigurationDraft, 'snapshot'>> {
    if (snapshotOrPrincipal && 'version' in snapshotOrPrincipal) {
      await this.claimedController(controllerId);
      return {
        snapshot: canonicalSnapshot(
          selectPresetChanges(snapshotOrPrincipal, application, selectedPaths, previewedDraftHash),
        ),
      };
    }
    if (snapshotOrPrincipal && 'userId' in snapshotOrPrincipal) principal ??= snapshotOrPrincipal;
    return this.withConfigurationLock(controllerId, async () => {
      const draft = await this.draftForPreset(controllerId);
      const snapshot = JSON.parse(draft.snapshot) as WagoConfigurationSnapshot;
      if (previewedDraftHash !== configurationHash(snapshot))
        throw new ConflictException('selected preset changes no longer match the configuration draft');
      const candidate = applyPreset(snapshot, application);
      const diff = configurationDiff(snapshot, candidate);
      const validPaths = new Set(diff.map((change) => change.path));
      if (!Array.isArray(selectedPaths) || selectedPaths.some((path) => !validPaths.has(path)))
        throw new ConflictException('selected preset changes no longer match the configuration draft');
      const updatedSnapshot = applySelectedChanges(snapshot, diff, selectedPaths);
      if (configurationHash(updatedSnapshot) === configurationHash(snapshot)) return draft;
      const provenance = parsePresetProvenance(draft.presetProvenance);
      const metadata = this.metadataFromProvenance(draft.presetProvenance);
      const reapplied = [...provenance, ...metadata.presets].some((entry) => {
        if (!entry || typeof entry !== 'object') return false;
        const previous = entry as { presetId?: string; channelId?: string };
        return (
          previous.presetId === application.presetId &&
          (previous.channelId === application.channelId ||
            (!previous.channelId &&
              snapshot.logicalChannels.some(
                (channel) => channel.id === application.channelId && channel.profile === application.presetId,
              )))
        );
      });
      const details = {
        presetId: application.presetId,
        channelId: application.channelId,
        before: wagoAuditSummary(snapshot),
      };
      const persist = async () => {
        draft.snapshot = canonicalSnapshot(updatedSnapshot);
        draft.reviewedHash = null;
        const storedProvenance = draft.presetProvenance ? JSON.parse(draft.presetProvenance) : null;
        draft.presetProvenance = storedProvenance?.editor
          ? JSON.stringify({
              ...storedProvenance,
              editor: {
                ...metadata,
                presets: [
                  ...metadata.presets.filter((entry) => entry.channelId !== application.channelId),
                  application,
                ],
              },
            })
          : JSON.stringify([
              ...provenance.slice(-99),
              {
                presetId: application.presetId,
                channelId: application.channelId,
                appliedAt: new Date().toISOString(),
                selectedPaths,
              },
            ]);
        draft.updatedAt = new Date().toISOString();
        return this.drafts.save(draft);
      };
      // Classification and before/after evidence belong to this same configuration lock.
      return principal
        ? new WagoAudit(this.context).run(
            principal,
            controllerId,
            reapplied ? 'preset_reapplication' : 'preset_application',
            details,
            persist,
            (saved) => ({ ...details, after: wagoAuditSummary(JSON.parse(saved.snapshot)) }),
          )
        : persist();
    });
  }
}
