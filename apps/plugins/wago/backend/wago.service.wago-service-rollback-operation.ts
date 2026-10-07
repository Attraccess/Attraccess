import { WagoAudit } from './wago-audit';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PluginAuditPrincipal } from '@attraccess/plugins-backend-sdk';
import { canonicalSnapshot } from './configuration';
import { editorMetadata, validateEditorSnapshot } from './configuration-editor';
import { configurationFlowImpacts } from './configuration-flow-references';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { WagoServicePublishDraftOperation } from './wago.wago-service-publish-draft-operation';
export abstract class WagoServiceRollbackOperation extends WagoServicePublishDraftOperation {
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
}
