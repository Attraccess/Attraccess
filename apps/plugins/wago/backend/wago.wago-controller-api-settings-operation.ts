import { Get } from '@nestjs/common';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { WagoControllerApiListOperation } from './wago.wago-controller-api-list-operation';


export abstract class WagoControllerApiSettingsOperation extends WagoControllerApiListOperation {
  @Auth('system.settings.manage')
  @Get('settings')
  settings() {
    return this.wago.getSettings();
  }
}
