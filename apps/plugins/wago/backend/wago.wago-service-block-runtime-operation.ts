import { WagoServiceIsRuntimeUpdateRequiredOperation } from './wago.service.wago-service-is-runtime-update-required-operation';


export abstract class WagoServiceBlockRuntimeOperation extends WagoServiceIsRuntimeUpdateRequiredOperation {
  blockRuntime(controllerId: number): void {
    this.runtimeUpdateBlocks.add(controllerId);
  }
}
