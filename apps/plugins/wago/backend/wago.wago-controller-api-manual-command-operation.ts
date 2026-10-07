import type { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { Body } from '@nestjs/common';
import { Param } from '@nestjs/common';
import { ParseIntPipe } from '@nestjs/common';
import { Post } from '@nestjs/common';
import { Req } from '@nestjs/common';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { wagoAuditPrincipal } from './wago-audit';
import { WagoControllerApiRotateCredentialsOperation } from './wago.wago-controller-api-rotate-credentials-operation';


export abstract class WagoControllerApiManualCommandOperation extends WagoControllerApiRotateCredentialsOperation {
  @Auth('resources.update')
  @Post('controllers/:id/commands')
  manualCommand(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.wago.manualCommand(id, body, wagoAuditPrincipal(request));
  }
}
