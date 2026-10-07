import { WagoAudit, wagoAuditSummary } from './wago-audit';
import { ConflictException } from '@nestjs/common';
import type { PluginAuditPrincipal } from '@attraccess/plugins-backend-sdk';
import { type WagoConfigurationSnapshot, configurationHash } from './configuration';
import { editorMetadata, validateEditorSnapshot, type ConfigurationEditorMetadata } from './configuration-editor';
import { WagoConfigurationDraft } from './wago-configuration-draft.entity';
import { WagoServiceGetConfigurationBaselineOperation } from './wago.wago-service-get-configuration-baseline-operation';
export abstract class WagoServiceSaveDraftOperation extends WagoServiceGetConfigurationBaselineOperation {
  async saveDraft(
    controllerId: number,
    snapshot: unknown,
    metadata?: ConfigurationEditorMetadata,
    principal?: PluginAuditPrincipal,
    expectedDraft?: Pick<WagoConfigurationDraft, 'snapshot' | 'presetProvenance' | 'updatedAt'> | null,
  ): Promise<WagoConfigurationDraft> {
    return this.withConfigurationLock(controllerId, async () => {
      const previous = await this.getDraft(controllerId);
      if (
        expectedDraft !== undefined &&
        (expectedDraft === null
          ? previous !== null
          : !previous ||
            expectedDraft.snapshot !== previous.snapshot ||
            expectedDraft.updatedAt !== previous.updatedAt ||
            expectedDraft.presetProvenance !== previous.presetProvenance)
      ) {
        throw new ConflictException('Saved draft changed. Reload it before saving your edits.');
      }
      const validatedMetadata = metadata === undefined ? undefined : editorMetadata(metadata);
      const previousMetadata = this.metadataFromProvenance(previous?.presetProvenance);
      const before = previous ? JSON.parse(previous.snapshot) : null;
      const candidate = snapshot as WagoConfigurationSnapshot;
      let persist = () => this.saveDraftWhileLocked(controllerId, snapshot, validatedMetadata);
      if (principal && validateEditorSnapshot(snapshot).length === 0) {
        // The editor appends provenance only for an explicit Apply action. Consume
        // persisted occurrences so ordinary edits and retried saves are not reapplications.
        const persistedApplications = previousMetadata.presets.map((entry) => configurationHash(entry));
        const appliedPresets = new Set(previousMetadata.presets.map((entry) => `${entry.presetId}:${entry.channelId}`));
        for (const application of validatedMetadata?.presets ?? []) {
          if (
            !candidate.logicalChannels.some(
              (channel) =>
                channel.id === application.channelId && channel.physicalPointId === application.physicalPointId,
            )
          )
            continue;
          const persistedIndex = persistedApplications.indexOf(configurationHash(application));
          if (persistedIndex !== -1) {
            persistedApplications.splice(persistedIndex, 1);
            continue;
          }
          const presetChannel = `${application.presetId}:${application.channelId}`;
          const reapplied = appliedPresets.has(presetChannel);
          appliedPresets.add(presetChannel);
          const operation = persist;
          const details = {
            presetId: application.presetId,
            channelId: application.channelId,
            before: wagoAuditSummary(before),
          };
          persist = () =>
            new WagoAudit(this.context).run(
              principal,
              controllerId,
              reapplied ? 'preset_reapplication' : 'preset_application',
              details,
              operation,
              (saved) => ({ ...details, after: wagoAuditSummary(JSON.parse(saved.snapshot)) }),
            );
        }
        for (const profile of candidate.modbus?.profiles ?? []) {
          const old = (before as WagoConfigurationSnapshot | null)?.modbus?.profiles.find(
            (entry) => entry.id === profile.id,
          );
          if (old && configurationHash(old) === configurationHash(profile)) continue;
          const operation = persist;
          const details = { profileId: profile.id, profileVersion: profile.version, before: wagoAuditSummary(before) };
          persist = () =>
            new WagoAudit(this.context).run(
              principal,
              controllerId,
              old ? 'profile_change' : 'profile_creation',
              details,
              operation,
              (saved) => ({ ...details, after: wagoAuditSummary(JSON.parse(saved.snapshot)) }),
            );
        }
      }
      return persist();
    });
  }
}
