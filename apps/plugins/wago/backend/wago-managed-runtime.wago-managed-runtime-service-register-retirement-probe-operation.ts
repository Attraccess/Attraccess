import { RootProbe } from './wago-managed-runtime.contracts';
import { WagoManagedRuntimeServiceRegisterPreparationAcceptanceOperation } from './wago-managed-runtime.wago-managed-runtime-service-register-preparation-acceptance-operation';


export abstract class WagoManagedRuntimeServiceRegisterRetirementProbeOperation extends WagoManagedRuntimeServiceRegisterPreparationAcceptanceOperation {
  registerRetirementProbe(probe: RootProbe): void {
    this.retirementProbe = probe;
  }
}
