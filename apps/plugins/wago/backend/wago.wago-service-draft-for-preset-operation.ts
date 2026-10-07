import { NotFoundException } from '@nestjs/common';
import { WagoConfigurationDraft } from './wago-configuration-draft.entity';
import { WagoServiceValidateDraftOperation } from './wago.wago-service-validate-draft-operation';


export abstract class WagoServiceDraftForPresetOperation extends WagoServiceValidateDraftOperation {
  protected async draftForPreset(controllerId: number): Promise<WagoConfigurationDraft> {
    await this.claimedController(controllerId);
    const draft = await this.drafts.findOneBy({ controllerId });
    if (!draft) throw new NotFoundException(`WAGO controller ${controllerId} has no configuration draft`);
    return draft;
  }
}
