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
import { WagoControllerApiManagementStatusOperation } from './wago.wago-controller-api-management-status-operation';


export abstract class WagoControllerApiPlatformActionOperation extends WagoControllerApiManagementStatusOperation {
  @Auth('system.settings.manage')
  @Post('commissioning/sessions/:id/platform/:action')
  platformAction(
    @Param('id', ParseIntPipe) id: number,
    @Param('action') action: string,
    @Body() body: Parameters<WagoCommissioningService['platform']>[2],
    @Req() request: AuthenticatedRequest,
  ) {
    if (!['inspect', 'activate', 'recover'].includes(action)) throw new BadRequestException('Unknown platform action');
    return this.commissioning.platform(
      id,
      action as Parameters<WagoCommissioningService['platform']>[1],
      body ?? {},
      commissioningPrincipal(request),
    );
  }
}
