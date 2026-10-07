import { WagoController } from './wago-controller.entity';
import { WagoServiceListOperation } from './wago.wago-service-list-operation';
export abstract class WagoServiceRegisterCommissioningDiscoveryHandlerOperation extends WagoServiceListOperation {


  registerCommissioningDiscoveryHandler(handler: (controller: WagoController) => Promise<void>): void {
    this.commissioningDiscoveryHandler = handler;
  }
}
