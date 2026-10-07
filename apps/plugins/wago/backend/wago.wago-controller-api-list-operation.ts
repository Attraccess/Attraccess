import { Get } from '@nestjs/common';
import { WagoControllerApiState } from './wago.wago-controller-api-state';


export abstract class WagoControllerApiListOperation extends WagoControllerApiState {
  @Get('controllers') list() {
    return this.wago.list();
  }
}
