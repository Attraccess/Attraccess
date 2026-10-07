import { configurationDiff } from './configuration';
import { WagoConfigurationDraft } from './wago-configuration-draft.entity';
import { configurationFlowImpacts } from './configuration-flow-references';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { NotFoundException } from '@nestjs/common';
import { WagoServiceSaveDraftWhileLockedOperation } from './wago.wago-service-save-draft-while-locked-operation';


export abstract class WagoServiceReviewDraftWhileLockedOperation extends WagoServiceSaveDraftWhileLockedOperation {
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
}
