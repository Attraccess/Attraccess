import { WagoServiceRegisterRuntimeStatusHandlerOperation } from './wago.wago-service-register-runtime-status-handler-operation';
export abstract class WagoServiceIsRuntimeUpdateRequiredOperation extends WagoServiceRegisterRuntimeStatusHandlerOperation {


  isRuntimeUpdateRequired(controllerId: number): boolean {
    const policy = this.runtimePolicies.get(controllerId);
    return (
      this.runtimeUpdateBlocks.has(controllerId) ||
      (!!this.runtimeStatusHandler && (!policy || policy.desired !== policy.observed))
    );
  }
}
