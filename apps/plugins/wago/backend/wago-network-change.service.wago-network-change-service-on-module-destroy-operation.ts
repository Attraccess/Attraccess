import { WagoNetworkChangeServiceState } from "./wago-network-change.service.wago-network-change-service-state";
export abstract class WagoNetworkChangeServiceOnModuleDestroyOperation extends WagoNetworkChangeServiceState {

  onModuleDestroy(): void {
    this.destroyed = true;
    this.active.forEach((controller) => controller.abort());
  }
}
