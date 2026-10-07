import { WagoCommissioningServiceToResponseOperation } from "./wago-commissioning.service.wago-commissioning-service-to-response-operation";
export abstract class WagoCommissioningServiceWithDeliveryLockOperation extends WagoCommissioningServiceToResponseOperation {


  protected async withDeliveryLock<T>(id: number, operation: () => Promise<T>): Promise<T> {
    const previous = this.deliveryLocks.get(id) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => (release = resolve));
    const queued = previous.then(() => current);
    this.deliveryLocks.set(id, queued);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.deliveryLocks.get(id) === queued) this.deliveryLocks.delete(id);
    }
  }
}
