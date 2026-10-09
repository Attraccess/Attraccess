import { WagoConfigurationRevision } from './revision.entity';

import { type WagoAuditLifecycle, WagoAudit } from '../audit/index';

import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';

import { configurationFlowImpacts } from './flow-references';

import { type PluginAuditPrincipal } from '@attraccess/plugins-backend-sdk';

import { configurationHash, configurationDiff, canonicalSnapshot } from './model';

import { validateEditorSnapshot, editorMetadata, type ConfigurationEditorMetadata } from './editor';

import { WagoConfigurationDraft } from './draft.entity';

import { compatibilityError } from '../protocol/index';

import { WagoController } from '../controllers/entity';

import { WagoDrafts } from './drafts';

export abstract class WagoRevisions extends WagoDrafts {
  protected async latestRevision(controllerId: number): Promise<WagoConfigurationRevision | null> {
    const [revision] = await this.revisions.find({ where: { controllerId }, order: { revision: 'DESC' }, take: 1 });
    return revision ?? null;
  }

  protected async auditRevision(
    lifecycle: WagoAuditLifecycle | undefined,
    operation: () => Promise<WagoConfigurationRevision>,
    allocated: () => number | undefined,
  ): Promise<WagoConfigurationRevision> {
    await lifecycle?.attempt();
    try {
      const result = await operation();
      await lifecycle?.finish('succeeded', { revision: result.revision });
      return result;
    } catch (error) {
      await lifecycle?.finish('failed', { revision: allocated() });
      throw error;
    }
  }

  protected async publishDraftWhileLocked(
    controllerId: number,
    force = false,
    reviewedHash?: string,
    principal?: PluginAuditPrincipal,
    preparedDraft?: WagoConfigurationDraft,
    onAllocated?: (revision: number) => void,
  ): Promise<WagoConfigurationRevision> {
    const controller = await this.claimedController(controllerId);
    this.requireConfigurationCompatibility(controller);
    const draft = preparedDraft ?? (await this.drafts.findOneBy({ controllerId }));
    if (!draft) throw new NotFoundException(`WAGO controller ${controllerId} has no configuration draft`);
    const validation = validateEditorSnapshot(JSON.parse(draft.snapshot));
    if (validation.length)
      throw new ConflictException({ message: 'configuration draft is invalid', errors: validation });
    const contentHash = configurationHash(JSON.parse(draft.snapshot));
    const previous = await this.latestRevision(controllerId);
    const impacts = await configurationFlowImpacts(
      this.context,
      controllerId,
      previous ? JSON.parse(previous.snapshot) : null,
      JSON.parse(draft.snapshot),
    );
    const reviewIdentity = this.reviewIdentity(draft, previous, impacts);
    if (reviewedHash !== undefined && reviewedHash !== reviewIdentity)
      throw new ConflictException('draft changed since your review; review it again');
    if (draft.reviewedHash !== reviewIdentity)
      throw new ConflictException('review the current configuration draft before publishing it');
    if (impacts.length && !force)
      throw new ConflictException({ message: 'acknowledge potential flow impacts before publishing', impacts });
    let allocatedRevision: number | undefined;
    const dispatch = (revision: WagoConfigurationRevision) => {
      allocatedRevision = revision.revision;
      onAllocated?.(revision.revision);
      return this.publishRevision(controller, revision);
    };
    const lifecycle = principal
      ? new WagoAudit(this.context).begin(principal, controllerId, force ? 'forced_publication' : 'publication')
      : undefined;
    const persist = async () => {
      if (preparedDraft) await this.drafts.save(preparedDraft);
      if (
        previous?.state === 'pending' &&
        previous.contentHash === contentHash &&
        (previous.presetProvenance ?? null) === (draft.presetProvenance ?? null)
      )
        return dispatch(previous);
      const revision = this.revisions.create({
        controllerId,
        revision: (previous?.revision ?? 0) + 1,
        snapshot: draft.snapshot,
        presetProvenance: draft.presetProvenance ?? null,
        contentHash,
        state: 'pending',
        rejectionErrors: null,
        publishedAt: new Date().toISOString(),
        reportedAt: null,
      });
      return dispatch(await this.revisions.save(revision));
    };
    return this.auditRevision(lifecycle, persist, () => allocatedRevision);
  }

  protected requireConfigurationCompatibility(controller: WagoController): void {
    const incompatibility = compatibilityError({
      protocolVersion: controller.protocolVersion,
      capabilities: JSON.parse(controller.capabilities) as string[],
    });
    if (incompatibility) throw new ConflictException(`Cannot publish configuration: ${incompatibility}`);
  }

  protected async reviewDraftWhileLocked(controllerId: number): Promise<{
    impacts: Awaited<ReturnType<typeof configurationFlowImpacts>>;
    draft: WagoConfigurationDraft;
    previous: WagoConfigurationRevision | null;
    changed: boolean;
    diff: ReturnType<typeof configurationDiff>;
    metadataDiff: ReturnType<typeof configurationDiff>;
  }> {
    await this.claimedController(controllerId);
    const draft = await this.drafts.findOneBy({ controllerId });
    if (!draft) throw new NotFoundException(`WAGO controller ${controllerId} has no configuration draft`);
    const previous = await this.latestRevision(controllerId);
    const impacts = await configurationFlowImpacts(
      this.context,
      controllerId,
      previous ? JSON.parse(previous.snapshot) : null,
      JSON.parse(draft.snapshot),
    );
    draft.reviewedHash = this.reviewIdentity(draft, previous, impacts);
    await this.drafts.save(draft);
    const diff = configurationDiff(previous ? JSON.parse(previous.snapshot) : null, JSON.parse(draft.snapshot));
    const metadataDiff = configurationDiff(
      this.metadataFromProvenance(previous?.presetProvenance),
      this.metadataFromProvenance(draft.presetProvenance),
    );
    return {
      draft,
      previous,
      changed: diff.length > 0 || metadataDiff.length > 0,
      diff,
      metadataDiff,
      impacts,
    };
  }

  protected async saveDraftWhileLocked(
    controllerId: number,
    snapshot: unknown,
    metadata?: ConfigurationEditorMetadata,
  ): Promise<WagoConfigurationDraft> {
    await this.claimedController(controllerId);
    let provenance: string | undefined;
    if (metadata !== undefined) {
      try {
        provenance = JSON.stringify({ editor: editorMetadata(metadata) });
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'invalid editor metadata');
      }
    }
    const serialized = canonicalSnapshot(snapshot);
    const existing = await this.drafts.findOneBy({ controllerId });
    const draft =
      existing ??
      this.drafts.create({
        controllerId,
        snapshot: serialized,
        reviewedHash: null,
        presetProvenance: null,
        updatedAt: '',
      });
    draft.snapshot = serialized;
    if (provenance !== undefined) draft.presetProvenance = provenance;
    draft.reviewedHash = null;
    draft.updatedAt = new Date().toISOString();
    return this.drafts.save(draft);
  }

  protected metadataFromProvenance(provenance: string | null | undefined): ConfigurationEditorMetadata {
    if (!provenance) return { names: {}, presets: [] };
    try {
      return editorMetadata(JSON.parse(provenance).editor);
    } catch {
      return { names: {}, presets: [] };
    }
  }

  protected draftIdentity(draft: WagoConfigurationDraft | null): string {
    return configurationHash({
      draft: draft ? { snapshot: draft.snapshot, metadata: draft.presetProvenance ?? null } : null,
    });
  }

  protected rollbackIdentity(
    draft: WagoConfigurationDraft | null,
    current: WagoConfigurationRevision | null,
    source: WagoConfigurationRevision,
    impacts: Awaited<ReturnType<typeof configurationFlowImpacts>>,
  ): string {
    return configurationHash({
      draft: this.draftIdentity(draft),
      current: this.revisionIdentity(current),
      source: this.revisionIdentity(source),
      impacts: this.impactIdentity(impacts),
    });
  }

  protected reviewIdentity(
    draft: WagoConfigurationDraft,
    current: WagoConfigurationRevision | null,
    impacts: Awaited<ReturnType<typeof configurationFlowImpacts>>,
  ): string {
    return configurationHash({
      draft: this.draftIdentity(draft),
      current: this.revisionIdentity(current),
      impacts: this.impactIdentity(impacts),
    });
  }

  protected impactIdentity(impacts: Awaited<ReturnType<typeof configurationFlowImpacts>>): unknown {
    return impacts
      .map((impact) => ({
        ...impact,
        references: [...impact.references].sort((a, b) => configurationHash(a).localeCompare(configurationHash(b))),
      }))
      .sort((a, b) => a.channelId.localeCompare(b.channelId));
  }

  protected revisionIdentity(revision: WagoConfigurationRevision | null): unknown {
    return revision
      ? { revision: revision.revision, contentHash: revision.contentHash, metadata: revision.presetProvenance ?? null }
      : null;
  }

  async previewRevision(
    controllerId: number,
    revision: number,
  ): Promise<{
    impacts: Awaited<ReturnType<typeof configurationFlowImpacts>>;
    revision: WagoConfigurationRevision;
    draftHash: string;
    current: WagoConfigurationRevision | null;
    diff: ReturnType<typeof configurationDiff>;
    metadataDiff: ReturnType<typeof configurationDiff>;
  }> {
    return this.withConfigurationLock(controllerId, async () => {
      await this.claimedController(controllerId);
      const selected = await this.revisions.findOneBy({ controllerId, revision });
      if (!selected) throw new NotFoundException(`WAGO configuration revision ${revision} not found`);
      const [current] = await this.revisions.find({ where: { controllerId }, order: { revision: 'DESC' }, take: 1 });
      const draft = await this.drafts.findOneBy({ controllerId });
      const impacts = await configurationFlowImpacts(
        this.context,
        controllerId,
        current ? JSON.parse(current.snapshot) : null,
        JSON.parse(selected.snapshot),
      );
      return {
        draftHash: this.rollbackIdentity(draft, current ?? null, selected, impacts),
        impacts,
        revision: selected,
        current: current ?? null,
        diff: configurationDiff(current ? JSON.parse(current.snapshot) : null, JSON.parse(selected.snapshot)),
        metadataDiff: configurationDiff(
          this.metadataFromProvenance(current?.presetProvenance),
          this.metadataFromProvenance(selected.presetProvenance),
        ),
      };
    });
  }

  async acknowledgeRejection(
    controllerId: number,
    revision: number,
    expected: { contentHash?: string; reportedAt?: string },
    principal: PluginAuditPrincipal,
  ): Promise<WagoConfigurationRevision> {
    return this.withConfigurationLock(controllerId, async () => {
      await this.claimedController(controllerId);
      const rejected = await this.revisions.findOneBy({ controllerId, revision });
      if (!rejected) throw new NotFoundException(`WAGO configuration revision ${revision} not found`);
      if (
        rejected.state !== 'rejected' ||
        !rejected.reportedAt ||
        expected.contentHash !== rejected.contentHash ||
        expected.reportedAt !== rejected.reportedAt
      )
        throw new ConflictException('rejection changed; refresh and review it before acknowledging');
      if (rejected.rejectionAcknowledgedAt) return rejected;
      return new WagoAudit(this.context).run(
        principal,
        controllerId,
        'rejection_acknowledgement',
        { revision },
        async () => {
          return this.revisions.save({
            ...rejected,
            rejectionAcknowledgedAt: new Date().toISOString(),
            rejectionAcknowledgedBy: principal.userId,
          });
        },
      );
    });
  }

  async rollback(
    controllerId: number,
    revision: number,
    force = false,
    sourceHash?: string,
    currentHash?: string | null,
    draftHash?: string,
    principal?: PluginAuditPrincipal,
  ): Promise<WagoConfigurationRevision> {
    return this.withConfigurationLock(controllerId, async () => {
      const controller = await this.claimedController(controllerId);
      this.requireConfigurationCompatibility(controller);
      const source = await this.revisions.findOneBy({ controllerId, revision });
      if (!source) throw new NotFoundException(`WAGO configuration revision ${revision} not found`);
      const current = await this.latestRevision(controllerId);
      const draft = await this.drafts.findOneBy({ controllerId });
      const snapshot = JSON.parse(source.snapshot);
      const errors = validateEditorSnapshot(snapshot);
      if (errors.length) throw new ConflictException({ message: 'rollback configuration is invalid', errors });
      const approvedImpacts = await configurationFlowImpacts(
        this.context,
        controllerId,
        current ? JSON.parse(current.snapshot) : null,
        snapshot,
      );
      const assertPreview = (impacts: typeof approvedImpacts) => {
        if (
          draftHash !== this.rollbackIdentity(draft, current, source, impacts) ||
          sourceHash !== source.contentHash ||
          currentHash !== (current?.contentHash ?? null)
        )
          throw new ConflictException('configuration changed since rollback preview; preview and confirm again');
      };
      assertPreview(approvedImpacts);
      if (approvedImpacts.length && !force)
        throw new ConflictException({
          message: 'acknowledge potential flow impacts before publishing',
          impacts: approvedImpacts,
        });
      let allocatedRevision: number | undefined;
      const lifecycle = principal
        ? new WagoAudit(this.context).begin(principal, controllerId, 'rollback', { sourceRevision: revision })
        : undefined;
      const persist = async () => {
        // Flow edits use a separate lock. Recheck before replacing the draft, then
        // carry the original consent into publication instead of silently re-reviewing.
        assertPreview(
          await configurationFlowImpacts(
            this.context,
            controllerId,
            current ? JSON.parse(current.snapshot) : null,
            snapshot,
          ),
        );
        const replacement = this.drafts.create({
          ...draft,
          controllerId,
          snapshot: canonicalSnapshot(snapshot),
          presetProvenance: JSON.stringify({
            editor: editorMetadata(
              (source.presetProvenance ? JSON.parse(source.presetProvenance).editor : null) ?? {
                names: {},
                presets: [],
              },
            ),
          }),
          reviewedHash: null,
          updatedAt: new Date().toISOString(),
        });
        const approvedHash = this.reviewIdentity(replacement, current, approvedImpacts);
        replacement.reviewedHash = approvedHash;
        // Publication validates the prepared replacement before persisting either
        // the draft or a revision, so late admission failures preserve editor work.
        return this.publishDraftWhileLocked(controllerId, force, approvedHash, undefined, replacement, (value) => {
          allocatedRevision = value;
        });
      };
      return this.auditRevision(lifecycle, persist, () => allocatedRevision);
    });
  }

  async publishDraft(
    controllerId: number,
    force = false,
    reviewedHash?: string,
    principal?: PluginAuditPrincipal,
  ): Promise<WagoConfigurationRevision> {
    return this.withConfigurationLock(controllerId, () =>
      this.publishDraftWhileLocked(controllerId, force, reviewedHash, principal),
    );
  }

  async reviewDraft(controllerId: number): Promise<{
    impacts: Awaited<ReturnType<typeof configurationFlowImpacts>>;
    draft: WagoConfigurationDraft;
    previous: WagoConfigurationRevision | null;
    changed: boolean;
    diff: ReturnType<typeof configurationDiff>;
    metadataDiff: ReturnType<typeof configurationDiff>;
  }> {
    return this.withConfigurationLock(controllerId, () => this.reviewDraftWhileLocked(controllerId));
  }
}
