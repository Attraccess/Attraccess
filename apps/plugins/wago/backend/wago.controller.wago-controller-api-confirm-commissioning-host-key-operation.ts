import { BadRequestException, Body, Param, ParseIntPipe, Post } from '@nestjs/common';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { WagoControllerApiCreateCommissioningSessionOperation } from "./wago.controller.wago-controller-api-create-commissioning-session-operation";
export abstract class WagoControllerApiConfirmCommissioningHostKeyOperation extends WagoControllerApiCreateCommissioningSessionOperation {

  @Auth('system.settings.manage')
  @Post('commissioning/sessions/:id/confirm-host-key')
  confirmCommissioningHostKey(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      hostKeyFingerprint?: string;
      trustMethod?: 'trusted_inventory' | 'isolated_service_connection';
      physicalIdentityConfirmed?: boolean;
    },
  ) {
    if (!body?.hostKeyFingerprint) throw new BadRequestException('SSH host-key fingerprint is required');
    return this.commissioning.confirmHostKey(
      id,
      body.hostKeyFingerprint,
      body.trustMethod,
      body.physicalIdentityConfirmed,
    );
  }
}
