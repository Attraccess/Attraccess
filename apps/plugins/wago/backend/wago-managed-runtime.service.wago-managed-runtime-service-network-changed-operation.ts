import { WagoManagedRuntimeServiceNetworkManagementOperation } from './wago-managed-runtime.wago-managed-runtime-service-network-management-operation';
export abstract class WagoManagedRuntimeServiceNetworkChangedOperation extends WagoManagedRuntimeServiceNetworkManagementOperation {


  networkChanged(controllerId: number): void {
    this.heartbeats.delete(controllerId);
    this.heartbeatStreams.delete(controllerId);
    this.wago.blockRuntime?.(controllerId);
    this.wake();
  }
}
