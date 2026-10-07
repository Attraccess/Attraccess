import { ConflictException } from '@nestjs/common';
import { WagoManagedRuntimeServiceSetActiveStateOperation } from './wago-managed-runtime.wago-managed-runtime-service-set-active-state-operation';


export abstract class WagoManagedRuntimeServiceRetryRuntimeOperation extends WagoManagedRuntimeServiceSetActiveStateOperation {
  async retryRuntime(controllerId: number): Promise<void> {
    await this.required(controllerId);
    if ((await this.coordinator.reconcile(controllerId, true)) === 'busy')
      throw new ConflictException('Controller is busy; retry after its current operation finishes');
  }
}
