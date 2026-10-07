import { configurationDiff } from './configuration';
import { WagoConfigurationDraft } from './wago-configuration-draft.entity';
import { configurationFlowImpacts } from './configuration-flow-references';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { WagoServiceRevisionsForOperation } from './wago.wago-service-revisions-for-operation';


export abstract class WagoServiceReviewDraftOperation extends WagoServiceRevisionsForOperation {
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
