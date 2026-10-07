import { WagoManagedRuntimeServiceRecoverPasswordOperation } from './wago-managed-runtime.wago-managed-runtime-service-recover-password-operation';


export abstract class WagoManagedRuntimeServiceRetireOperation extends WagoManagedRuntimeServiceRecoverPasswordOperation {
  async retire(controllerId: number): Promise<void> {
    await this.assertRemovable(controllerId);
    await this.access.update({ controllerId }, { state: 'retired' });
    this.heartbeats.delete(controllerId);
  }
}
