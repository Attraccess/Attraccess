import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { configurationHash } from './configuration';
import { WagoConfigurationDraft } from './wago-configuration-draft.entity';
import { configurationFlowImpacts } from './configuration-flow-references';
import { WagoServiceReviewIdentityOperation } from './wago.wago-service-review-identity-operation';


export abstract class WagoServiceRollbackIdentityOperation extends WagoServiceReviewIdentityOperation {
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
}
