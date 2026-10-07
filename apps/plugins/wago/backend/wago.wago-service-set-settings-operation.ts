import { WagoSettings } from './wago-settings.entity';
import { ConflictException } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { normalizeOperationalPrefix } from './protocol';
import { WagoServiceGetSettingsOperation } from './wago.wago-service-get-settings-operation';


export abstract class WagoServiceSetSettingsOperation extends WagoServiceGetSettingsOperation {
  async setSettings(serverId?: number | null, operationalPrefix?: string): Promise<WagoSettings> {
    if (serverId !== undefined && serverId !== null && !(await this.context.getMqttServerConfig(serverId)))
      throw new NotFoundException(`MQTT server ${serverId} not found`);
    const save = async (): Promise<WagoSettings> => {
      const settings = await this.getSettings();
      if (serverId !== undefined) settings.defaultMqttServerId = serverId;
      if (operationalPrefix !== undefined) {
        const normalizedPrefix = normalizeOperationalPrefix(operationalPrefix);
        if (normalizedPrefix !== settings.operationalPrefix) {
          const controllers = await this.controllers.find({ where: { trustState: 'claimed' } });
          if (controllers.length)
            throw new ConflictException('operational MQTT prefix cannot change after a controller has been claimed');
          settings.operationalPrefix = normalizedPrefix;
        }
      }
      await this.settings.save(settings);
      return settings;
    };
    const settings = operationalPrefix === undefined ? await save() : await this.withClaimConfigurationLock(save);
    await this.subscribeConfiguredServers();
    return settings;
  }
}
