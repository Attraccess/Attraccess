import { configurationHash } from './configuration';
import { WagoConfigurationDraft } from './wago-configuration-draft.entity';
import { WagoServiceRollbackIdentityOperation } from './wago.wago-service-rollback-identity-operation';


export abstract class WagoServiceDraftIdentityOperation extends WagoServiceRollbackIdentityOperation {
  protected draftIdentity(draft: WagoConfigurationDraft | null): string {
    return configurationHash({
      draft: draft ? { snapshot: draft.snapshot, metadata: draft.presetProvenance ?? null } : null,
    });
  }
}
