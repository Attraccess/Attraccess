import { Body } from '@nestjs/common';
import { Param } from '@nestjs/common';
import { ParseIntPipe } from '@nestjs/common';
import { Post } from '@nestjs/common';
import { Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { wagoAuditPrincipal } from './wago-audit';
import { WagoControllerApiRemoveCommissioningSessionOperation } from './wago.controller.wago-controller-api-remove-commissioning-session-operation';


export abstract class WagoControllerApiClaimOperation extends WagoControllerApiRemoveCommissioningSessionOperation {
  @Post('controllers/:id/claim') claim(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: string; verifier?: string; mqttServerId?: number },
    @Req() request: AuthenticatedRequest,
  ) {
    return this.audit.run(wagoAuditPrincipal(request), id, 'claim', {}, () =>
      this.wago.claim(id, body?.name ?? '', body?.verifier ?? '', body?.mqttServerId),
    );
  }
}
