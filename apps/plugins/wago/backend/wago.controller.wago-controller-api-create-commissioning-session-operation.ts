import { BadRequestException, Body, Post, Req } from '@nestjs/common';
import { Auth } from '@attraccess/plugins-backend-sdk';
import type { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { commissioningPrincipal } from './wago-commissioning-audit';
import { WagoControllerApiCommissioningSessionsOperation } from "./wago.controller.wago-controller-api-commissioning-sessions-operation";
export abstract class WagoControllerApiCreateCommissioningSessionOperation extends WagoControllerApiCommissioningSessionsOperation {

  @Auth('system.settings.manage')
  @Post('commissioning/sessions')
  createCommissioningSession(
    @Body() body: { mqttServerId?: number; targetHost?: string; name?: string },
    @Req() request?: AuthenticatedRequest,
  ) {
    if (!body?.mqttServerId) throw new BadRequestException('MQTT server is required');
    if (!body.name?.trim()) throw new BadRequestException('controller name is required');
    return this.commissioning.create(
      {
        mqttServerId: body.mqttServerId,
        targetHost: body.targetHost ?? '',
        name: body.name,
      },
      commissioningPrincipal(request),
    );
  }
}
