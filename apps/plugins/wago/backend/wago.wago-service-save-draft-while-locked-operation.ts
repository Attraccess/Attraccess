import { WagoConfigurationDraft } from './wago-configuration-draft.entity';
import { BadRequestException } from '@nestjs/common';
import { canonicalSnapshot } from './configuration';
import { editorMetadata } from './configuration-editor';
import type { ConfigurationEditorMetadata } from './configuration-editor';
import { WagoServiceMetadataFromProvenanceOperation } from './wago.wago-service-metadata-from-provenance-operation';


export abstract class WagoServiceSaveDraftWhileLockedOperation extends WagoServiceMetadataFromProvenanceOperation {
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
}
