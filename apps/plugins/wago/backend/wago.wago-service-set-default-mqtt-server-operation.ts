import { WagoSettings } from './wago-settings.entity';
import { WagoServiceSetSettingsOperation } from './wago.wago-service-set-settings-operation';


export abstract class WagoServiceSetDefaultMqttServerOperation extends WagoServiceSetSettingsOperation {
  async setDefaultMqttServer(serverId: number | null): Promise<WagoSettings> {
    return this.setSettings(serverId);
  }
}
