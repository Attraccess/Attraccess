import { Body } from '@nestjs/common';
import { Param } from '@nestjs/common';
import { ParseIntPipe } from '@nestjs/common';
import { Post } from '@nestjs/common';
import { Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { wagoAuditPrincipal } from './wago-audit';
import { BadRequestException } from '@nestjs/common';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { WagoControllerApiClaimOperation } from './wago.wago-controller-api-claim-operation';


export abstract class WagoControllerApiCompleteManualCredentialsOperation extends WagoControllerApiClaimOperation {
  @Auth('system.settings.manage')
  @Post('controllers/:id/credentials/manual/complete')
  completeManualCredentials(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: string; verifier?: string; username?: string; password?: string },
    @Req() request: AuthenticatedRequest,
  ) {
    const principal = wagoAuditPrincipal(request);
    if (
      !body ||
      Object.keys(body).some((key) => !['name', 'verifier', 'username', 'password'].includes(key)) ||
      typeof body.name !== 'string' ||
      !body.name ||
      typeof body.verifier !== 'string' ||
      !body.verifier ||
      typeof body.username !== 'string' ||
      !body.username ||
      typeof body.password !== 'string' ||
      !body.password
    )
      throw new BadRequestException('Controller name, physical verifier and provisioned credentials are required');
    const input = { name: body.name, verifier: body.verifier, username: body.username, password: body.password };
    return this.commissioning.operateControllerSafely(id, (assertOwned) =>
      this.wago.completeManualCredentials(id, input, principal, assertOwned),
    );
  }
}
