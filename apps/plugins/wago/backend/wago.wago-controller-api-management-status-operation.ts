import { Get } from '@nestjs/common';
import { Param } from '@nestjs/common';
import { ParseIntPipe } from '@nestjs/common';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { WagoControllerApiCommissioningVerificationOperation } from './wago.controller.wago-controller-api-commissioning-verification-operation';


export abstract class WagoControllerApiManagementStatusOperation extends WagoControllerApiCommissioningVerificationOperation {
  @Auth('system.settings.manage')
  @Get('commissioning/sessions/:id/management')
  managementStatus(@Param('id', ParseIntPipe) id: number) {
    return this.commissioning.managementStatus(id);
  }
}
