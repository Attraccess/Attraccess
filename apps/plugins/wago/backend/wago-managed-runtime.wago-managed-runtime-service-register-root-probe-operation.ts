import { RootProbe } from './wago-managed-runtime.contracts';
import { WagoManagedRuntimeServiceOnApplicationBootstrapOperation } from './wago-managed-runtime.wago-managed-runtime-service-on-application-bootstrap-operation';


export abstract class WagoManagedRuntimeServiceRegisterRootProbeOperation extends WagoManagedRuntimeServiceOnApplicationBootstrapOperation {
  registerRootProbe(probe: RootProbe): void {
    this.rootProbe = probe;
  }
}
