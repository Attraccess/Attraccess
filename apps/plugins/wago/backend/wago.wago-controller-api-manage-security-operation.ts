import type { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningService } from './wago-commissioning.service';
import { BadRequestException } from '@nestjs/common';
import { Body } from '@nestjs/common';
import { Param } from '@nestjs/common';
import { ParseIntPipe } from '@nestjs/common';
import { Post } from '@nestjs/common';
import { Req } from '@nestjs/common';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { commissioningPrincipal } from './wago-commissioning-audit';
import { WagoControllerApiPlatformActionOperation } from './wago.wago-controller-api-platform-action-operation';


export abstract class WagoControllerApiManageSecurityOperation extends WagoControllerApiPlatformActionOperation {
  @Auth('system.settings.manage')
  @Post('commissioning/sessions/:id/management/:action')
  manageSecurity(
    @Param('id', ParseIntPipe) id: number,
    @Param('action') action: string,
    @Body() body: Parameters<WagoCommissioningService['manageSecurity']>[2],
    @Req() request: AuthenticatedRequest,
  ) {
    if (!['inspect', 'review', 'apply', 'recover'].includes(action))
      throw new BadRequestException('Unknown management action');
    return this.commissioning.manageSecurity(
      id,
      action as Parameters<WagoCommissioningService['manageSecurity']>[1],
      body ?? {},
      commissioningPrincipal(request),
    );
  }
}
