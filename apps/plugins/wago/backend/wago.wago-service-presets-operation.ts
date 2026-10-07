import { WAGO_PRESETS } from './configuration';
import { WagoServiceSaveDraftOperation } from './wago.service.wago-service-save-draft-operation';


export abstract class WagoServicePresetsOperation extends WagoServiceSaveDraftOperation {
  presets() {
    return WAGO_PRESETS;
  }
}
