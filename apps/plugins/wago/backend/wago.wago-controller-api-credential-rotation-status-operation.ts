import { Param } from '@nestjs/common';
import { ParseIntPipe } from '@nestjs/common';
import { Get } from '@nestjs/common';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { WagoControllerApiCompleteManualCredentialsOperation } from './wago.wago-controller-api-complete-manual-credentials-operation';


export abstract class WagoControllerApiCredentialRotationStatusOperation extends WagoControllerApiCompleteManualCredentialsOperation {
  @Auth('system.settings.manage')
  @Get('controllers/:id/credentials/rotation')
  credentialRotationStatus(@Param('id', ParseIntPipe) id: number) {
    return this.credentialRotation.status(id);
  }
}
