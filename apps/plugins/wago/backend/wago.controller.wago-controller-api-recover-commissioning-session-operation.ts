import { Body, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import { Auth } from '@attraccess/plugins-backend-sdk';
import type { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { commissioningPrincipal } from './wago-commissioning-audit';
import { CommissioningAttemptInput } from "./wago.controller.commissioning-attempt-input";
import { validateCommissioningAttempt } from "./wago.controller.validate-commissioning-attempt";
import { WagoControllerApiDeliverCommissioningSessionOperation } from "./wago.controller.wago-controller-api-deliver-commissioning-session-operation";
export abstract class WagoControllerApiRecoverCommissioningSessionOperation extends WagoControllerApiDeliverCommissioningSessionOperation {

  @Auth('system.settings.manage')
  @Post('commissioning/sessions/:id/recover')
  recoverCommissioningSession(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CommissioningAttemptInput,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commissioning.recover(
      id,
      validateCommissioningAttempt(body, 'recovery'),
      commissioningPrincipal(request),
    );
  }
}
