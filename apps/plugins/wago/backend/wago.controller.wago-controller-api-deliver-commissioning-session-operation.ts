import { Body, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import { Auth } from '@attraccess/plugins-backend-sdk';
import type { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { commissioningPrincipal } from './wago-commissioning-audit';
import { CommissioningAttemptInput } from "./wago.controller.commissioning-attempt-input";
import { validateCommissioningAttempt } from "./wago.controller.validate-commissioning-attempt";
import { WagoControllerApiConfirmCommissioningHostKeyOperation } from "./wago.controller.wago-controller-api-confirm-commissioning-host-key-operation";
export abstract class WagoControllerApiDeliverCommissioningSessionOperation extends WagoControllerApiConfirmCommissioningHostKeyOperation {

  @Auth('system.settings.manage')
  @Post('commissioning/sessions/:id/deliver')
  deliverCommissioningSession(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CommissioningAttemptInput,
    @Req() request?: AuthenticatedRequest,
  ) {
    return this.commissioning.deliver(
      id,
      validateCommissioningAttempt(body, 'installation'),
      commissioningPrincipal(request),
    );
  }
}
