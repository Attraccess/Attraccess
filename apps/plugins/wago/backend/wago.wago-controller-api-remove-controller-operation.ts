import { Param } from '@nestjs/common';
import { ParseIntPipe } from '@nestjs/common';
import { Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { wagoAuditPrincipal } from './wago-audit';
import { Delete } from '@nestjs/common';
import { WagoControllerApiManualCommandOperation } from './wago.wago-controller-api-manual-command-operation';


export abstract class WagoControllerApiRemoveControllerOperation extends WagoControllerApiManualCommandOperation {
  @Delete('controllers/:id') async removeController(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.commissioning.removeControllerSafely(id, (assertOwned) =>
      this.audit.run(wagoAuditPrincipal(request), id, 'unclaim', {}, () => this.wago.remove(id, assertOwned)),
    );
  }
}
