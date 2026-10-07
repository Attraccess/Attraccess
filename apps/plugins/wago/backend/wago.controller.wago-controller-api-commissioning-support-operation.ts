import { Get } from '@nestjs/common';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { WagoControllerApiSetSettingsOperation } from './wago.wago-controller-api-set-settings-operation';
export abstract class WagoControllerApiCommissioningSupportOperation extends WagoControllerApiSetSettingsOperation {

  @Auth('system.settings.manage')
  @Get('commissioning/support')
  commissioningSupport() {
    return this.commissioning.support();
  }
}
