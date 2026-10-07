import { Get, Param, ParseIntPipe } from '@nestjs/common';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { WagoControllerApiRecoverCommissioningSessionOperation } from "./wago.controller.wago-controller-api-recover-commissioning-session-operation";
export abstract class WagoControllerApiCommissioningVerificationOperation extends WagoControllerApiRecoverCommissioningSessionOperation {

  @Auth('system.settings.manage')
  @Get('commissioning/sessions/:id/verification')
  commissioningVerification(@Param('id', ParseIntPipe) id: number) {
    return this.commissioning.verification(id);
  }
}
