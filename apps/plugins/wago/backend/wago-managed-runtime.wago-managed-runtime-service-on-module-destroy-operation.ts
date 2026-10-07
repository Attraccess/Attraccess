import { WagoManagedRuntimeServiceAuditUpdateOperation } from './wago-managed-runtime.wago-managed-runtime-service-audit-update-operation';


export abstract class WagoManagedRuntimeServiceOnModuleDestroyOperation extends WagoManagedRuntimeServiceAuditUpdateOperation {
  async onModuleDestroy() {
    this.destroyed = true;
    if (this.timer) clearInterval(this.timer);
    const stopped = this.coordinator?.stop();
    for (const operation of this.connections) operation.abort();
    await stopped;
    this.heartbeats.clear();
    this.heartbeatStreams.clear();
    this.previousBoots.clear();
    this.verifyingControllers.clear();
    this.enrolmentProgress.clear();
  }
}
