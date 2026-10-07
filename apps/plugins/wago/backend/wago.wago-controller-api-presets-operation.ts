import { Get } from '@nestjs/common';
import { WagoControllerApiBaselineOperation } from './wago.wago-controller-api-baseline-operation';


export abstract class WagoControllerApiPresetsOperation extends WagoControllerApiBaselineOperation {
  @Get('configuration/presets') presets() {
    return this.wago.presets();
  }
}
