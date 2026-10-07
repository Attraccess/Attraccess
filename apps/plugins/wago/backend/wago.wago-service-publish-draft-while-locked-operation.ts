import { NotFoundException } from '@nestjs/common';
import { configurationFlowImpacts } from './configuration-flow-references';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import type { PluginAuditPrincipal } from '@attraccess/plugins-backend-sdk';
import { WagoAudit } from './wago-audit';
import { ConflictException } from '@nestjs/common';
import { configurationHash } from './configuration';
import { validateEditorSnapshot } from './configuration-editor';
import { WagoConfigurationDraft } from './wago-configuration-draft.entity';
import { WagoServiceRequireConfigurationCompatibilityOperation } from './wago.wago-service-require-configuration-compatibility-operation';


export abstract class WagoServicePublishDraftWhileLockedOperation extends WagoServiceRequireConfigurationCompatibilityOperation {
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
}
