import { Param } from '@nestjs/common';
import { ParseIntPipe } from '@nestjs/common';
import { Get } from '@nestjs/common';
import { WagoControllerApiRemoveControllerOperation } from './wago.wago-controller-api-remove-controller-operation';


export abstract class WagoControllerApiDraftOperation extends WagoControllerApiRemoveControllerOperation {
  @Get('controllers/:id/configuration/draft') draft(@Param('id', ParseIntPipe) id: number) {
    return this.wago.getDraft(id);
  }
}
