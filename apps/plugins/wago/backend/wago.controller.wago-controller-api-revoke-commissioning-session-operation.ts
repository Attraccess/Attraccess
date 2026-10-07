import { Param, ParseIntPipe, Post } from '@nestjs/common';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { WagoControllerApiManageSecurityOperation } from './wago.wago-controller-api-manage-security-operation';
export abstract class WagoControllerApiRevokeCommissioningSessionOperation extends WagoControllerApiManageSecurityOperation {

  @Auth('system.settings.manage')
  @Post('commissioning/sessions/:id/revoke')
  revokeCommissioningSession(@Param('id', ParseIntPipe) id: number) {
    return this.commissioning.revoke(id);
  }
}
