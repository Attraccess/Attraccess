import { WagoManagedRuntimeServiceStatusOperation } from './wago-managed-runtime.wago-managed-runtime-service-status-operation';


export abstract class WagoManagedRuntimeServiceSessionStatusOperation extends WagoManagedRuntimeServiceStatusOperation {
  async sessionStatus(sessionId: number) {
    return this.publicStatus(await this.access.findOneBy({ sessionId }));
  }
}
