import { WagoManagedRuntimeServiceNetworkChangedOperation } from './wago-managed-runtime.service.wago-managed-runtime-service-network-changed-operation';


export abstract class WagoManagedRuntimeServiceHasAccessOperation extends WagoManagedRuntimeServiceNetworkChangedOperation {
  async hasAccess(sessionId: number): Promise<boolean> {
    return !!(await this.access.findOneBy({ sessionId }));
  }
}
