import { BadRequestException } from '@nestjs/common';
import { Body } from '@nestjs/common';
import { Param } from '@nestjs/common';
import { ParseIntPipe } from '@nestjs/common';
import { Post } from '@nestjs/common';
import { Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { wagoAuditPrincipal } from './wago-audit';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { WagoControllerApiCredentialRotationStatusOperation } from './wago.wago-controller-api-credential-rotation-status-operation';


export abstract class WagoControllerApiRotateCredentialsOperation extends WagoControllerApiCredentialRotationStatusOperation {
  @Auth('system.settings.manage')
  @Post('controllers/:id/credentials/rotate')
  async rotateCredentials(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { confirm?: boolean; retry?: boolean },
    @Req() request: AuthenticatedRequest,
  ) {
    if (!body || Object.keys(body).some((key) => key !== 'confirm' && key !== 'retry') || body.confirm !== true)
      throw new BadRequestException('Explicit credential rotation consent is required');
    if (body.retry !== undefined && typeof body.retry !== 'boolean')
      throw new BadRequestException('Invalid rotation retry flag');
    const settings = await this.wago.getSettings();
    return this.commissioning.operateControllerSafely(
      id,
      (_assertOwned, guard) =>
        this.credentialRotation.rotate(
          id,
          settings.operationalPrefix,
          wagoAuditPrincipal(request),
          guard,
          body.retry === true,
        ),
      true,
    );
  }
}
