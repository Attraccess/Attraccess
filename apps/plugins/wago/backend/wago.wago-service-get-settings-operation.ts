import { WagoSettings } from './wago-settings.entity';
import { WagoServiceSetRuntimePolicyOperation } from './wago.wago-service-set-runtime-policy-operation';


export abstract class WagoServiceGetSettingsOperation extends WagoServiceSetRuntimePolicyOperation {
  async getSettings(): Promise<WagoSettings> {
    const settings = await this.settings.findOneBy({ id: 1 });
    if (settings) return settings;
    await this.settings
      .createQueryBuilder()
      .insert()
      .values({ id: 1, defaultMqttServerId: null, operationalPrefix: 'attraccess/wago' })
      .orIgnore()
      .execute();
    return this.settings.findOneByOrFail({ id: 1 });
  }
}
