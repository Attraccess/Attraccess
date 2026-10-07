import { Param } from '@nestjs/common';
import { ParseIntPipe } from '@nestjs/common';
import { Get } from '@nestjs/common';
import { WagoControllerApiDraftOperation } from './wago.wago-controller-api-draft-operation';


export abstract class WagoControllerApiBaselineOperation extends WagoControllerApiDraftOperation {
  @Get('controllers/:id/configuration/baseline') baseline(@Param('id', ParseIntPipe) id: number) {
    return this.wago.getConfigurationBaseline(id);
  }
}
