import { WagoConfigurationRevision } from './revision.entity';

import { WagoAudit, wagoAuditSummary } from '../audit/index';

import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

import { type PluginAuditPrincipal } from '@attraccess/plugins-backend-sdk';

import {
  applyPreset,
  type WagoPresetApplication,
  type WagoConfigurationSnapshot,
  canonicalSnapshot,
  configurationDiff,
  configurationHash,
  type ConfigurationValidationError,
  WAGO_PRESETS,
} from './model';

import {
  selectPresetChanges,
  validateEditorSnapshot,
  previewConfigurationPreset,
  editorMetadata,
  type ConfigurationEditorMetadata,
} from './editor';

import { WagoConfigurationDraft } from './draft.entity';

import { applySelectedChanges, parsePresetProvenance } from '../controllers/model';

import { WagoRegistry } from '../controllers/registry';

export abstract class WagoDrafts extends WagoRegistry {
  async revisionsFor(
    controllerId: number,
    offset = 0,
    limit = 20,
  ): Promise<{ revisions: Array<Omit<WagoConfigurationRevision, 'snapshot'>>; offset: number; limit: number }> {
    await this.claimedController(controllerId);
    const pageOffset = Number.isSafeInteger(offset) && offset > 0 ? offset : 0;
    const pageLimit = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 100) : 20;
    const revisions = await this.revisions.find({
      where: { controllerId },
      order: { revision: 'DESC' },
      select: [
        'id',
        'controllerId',
        'revision',
        'contentHash',
        'state',
        'rejectionErrors',
        'rejectionAcknowledgedAt',
        'rejectionAcknowledgedBy',
        'publishedAt',
        'reportedAt',
        'presetProvenance',
      ],
      skip: pageOffset,
      take: pageLimit,
    });
    return { revisions, offset: pageOffset, limit: pageLimit };
  }

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

  protected async draftForPreset(controllerId: number): Promise<WagoConfigurationDraft> {
    await this.claimedController(controllerId);
    const draft = await this.drafts.findOneBy({ controllerId });
    if (!draft) throw new NotFoundException(`WAGO controller ${controllerId} has no configuration draft`);
    return draft;
  }

  async validateDraft(
    controllerId: number,
    snapshot?: unknown,
  ): Promise<{ valid: boolean; errors: ConfigurationValidationError[] }> {
    const draft = await this.getDraft(controllerId);
    if (!draft && snapshot === undefined)
      throw new NotFoundException(`WAGO controller ${controllerId} has no configuration draft`);
    const errors = validateEditorSnapshot(snapshot === undefined && draft ? JSON.parse(draft.snapshot) : snapshot);
    return { valid: errors.length === 0, errors };
  }

  async previewPreset(controllerId: number, application: WagoPresetApplication, snapshot?: WagoConfigurationSnapshot) {
    const draft = await this.getDraft(controllerId);
    const source =
      snapshot ?? (draft ? JSON.parse(draft.snapshot) : { version: 1, physicalPoints: [], logicalChannels: [] });
    try {
      return previewConfigurationPreset(source, application);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'invalid preset');
    }
  }

  presets() {
    return WAGO_PRESETS;
  }

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

  async getConfigurationBaseline(controllerId: number): Promise<WagoConfigurationRevision | null> {
    await this.claimedController(controllerId);
    const [revision] = await this.revisions.find({
      where: { controllerId, state: 'applied' },
      order: { revision: 'DESC' },
      take: 1,
    });
    return revision ?? null;
  }

  async getDraft(controllerId: number): Promise<WagoConfigurationDraft | null> {
    await this.claimedController(controllerId);
    return this.drafts.findOneBy({ controllerId });
  }
}
