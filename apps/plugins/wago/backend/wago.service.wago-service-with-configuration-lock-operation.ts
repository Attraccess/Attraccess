import { WagoServiceClaimedControllerOperation } from './wago.wago-service-claimed-controller-operation';
export abstract class WagoServiceWithConfigurationLockOperation extends WagoServiceClaimedControllerOperation {
  protected async withConfigurationLock<T>(id: number, operation: () => Promise<T>): Promise<T> {
    const previous = this.configurationLocks.get(id) ?? Promise.resolve();
    let release!: () => void;
    const lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.configurationLocks.set(id, lock);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.configurationLocks.get(id) === lock) this.configurationLocks.delete(id);
    }
  }
}
