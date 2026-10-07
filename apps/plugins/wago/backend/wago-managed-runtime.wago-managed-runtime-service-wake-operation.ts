import { WagoManagedRuntimeServiceProveOperation } from './wago-managed-runtime.wago-managed-runtime-service-prove-operation';


export abstract class WagoManagedRuntimeServiceWakeOperation extends WagoManagedRuntimeServiceProveOperation {
  protected wake() {
    if (this.destroyed || this.scanning || !this.coordinator || Date.now() < this.nextScanAt) return;
    this.nextScanAt = Date.now() + 30_000;
    this.scanning = true;
    void this.scan()
      .catch(() => this.context.logger.warn('Managed CC100 reconciliation requires attention.'))
      .finally(() => {
        this.scanning = false;
      });
  }
}
