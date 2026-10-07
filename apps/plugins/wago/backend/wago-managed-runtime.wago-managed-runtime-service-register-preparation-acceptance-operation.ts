import { RootAcceptance } from './wago-managed-runtime.contracts';
import { WagoManagedRuntimeServiceRegisterRootProbeOperation } from './wago-managed-runtime.wago-managed-runtime-service-register-root-probe-operation';


export abstract class WagoManagedRuntimeServiceRegisterPreparationAcceptanceOperation extends WagoManagedRuntimeServiceRegisterRootProbeOperation {
  registerPreparationAcceptance(accept: RootAcceptance): void {
    this.rootAcceptance = accept;
  }
}
