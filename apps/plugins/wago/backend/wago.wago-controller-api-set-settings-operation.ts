import { Body } from '@nestjs/common';
import { Post } from '@nestjs/common';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { WagoControllerApiSettingsOperation } from './wago.wago-controller-api-settings-operation';


export abstract class WagoControllerApiSetSettingsOperation extends WagoControllerApiSettingsOperation {
  @Auth('system.settings.manage')
  @Post('settings')
  setSettings(@Body() body: { defaultMqttServerId?: number | null; operationalPrefix?: string }) {
    return this.wago.setSettings(body?.defaultMqttServerId, body?.operationalPrefix);
  }
}
