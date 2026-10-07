import { WagoServiceRegisterCommissioningDiscoveryHandlerOperation } from './wago.service.wago-service-register-commissioning-discovery-handler-operation';
import { WagoService } from './wago.service';


export abstract class WagoServiceRegisterRuntimeStatusHandlerOperation extends WagoServiceRegisterCommissioningDiscoveryHandlerOperation {
  registerRuntimeStatusHandler(handler: NonNullable<WagoService['runtimeStatusHandler']>): void {
    this.runtimeStatusHandler = handler;
  }
}
