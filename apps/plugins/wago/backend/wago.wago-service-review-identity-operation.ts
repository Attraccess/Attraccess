import { WagoConfigurationDraft } from './wago-configuration-draft.entity';
import { configurationFlowImpacts } from './configuration-flow-references';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { configurationHash } from './configuration';
import { WagoServiceImpactIdentityOperation } from './wago.wago-service-impact-identity-operation';


export abstract class WagoServiceReviewIdentityOperation extends WagoServiceImpactIdentityOperation {
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
}
