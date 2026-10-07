import { Get, Query } from '@nestjs/common';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { WagoControllerApiCommissioningSupportOperation } from "./wago.controller.wago-controller-api-commissioning-support-operation";
export abstract class WagoControllerApiCommissioningSessionsOperation extends WagoControllerApiCommissioningSupportOperation {

  @Auth('system.settings.manage')
  @Get('commissioning/sessions')
  commissioningSessions(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.commissioning.list(Number(limit), Number(offset));
  }
}
