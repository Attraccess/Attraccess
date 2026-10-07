import { Delete, Param, ParseIntPipe } from '@nestjs/common';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { WagoControllerApiRevokeCommissioningSessionOperation } from "./wago.controller.wago-controller-api-revoke-commissioning-session-operation";
export abstract class WagoControllerApiRemoveCommissioningSessionOperation extends WagoControllerApiRevokeCommissioningSessionOperation {

  @Auth('system.settings.manage')
  @Delete('commissioning/sessions/:id')
  async removeCommissioningSession(@Param('id', ParseIntPipe) id: number) {
    await this.commissioning.remove(id);
  }
}
