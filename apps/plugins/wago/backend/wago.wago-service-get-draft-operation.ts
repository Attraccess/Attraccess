import { WagoConfigurationDraft } from './wago-configuration-draft.entity';
import { WagoServiceSetDefaultMqttServerOperation } from './wago.wago-service-set-default-mqtt-server-operation';


export abstract class WagoServiceGetDraftOperation extends WagoServiceSetDefaultMqttServerOperation {
  async getDraft(controllerId: number): Promise<WagoConfigurationDraft | null> {
    await this.claimedController(controllerId);
    return this.drafts.findOneBy({ controllerId });
  }
}
