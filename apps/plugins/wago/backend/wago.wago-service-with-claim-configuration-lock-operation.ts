import { WagoServiceWithClaimLockOperation } from './wago.wago-service-with-claim-lock-operation';


export abstract class WagoServiceWithClaimConfigurationLockOperation extends WagoServiceWithClaimLockOperation {
  protected async withClaimConfigurationLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.claimConfigurationLock;
    let release!: () => void;
    const lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.claimConfigurationLock = lock;
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.claimConfigurationLock === lock) this.claimConfigurationLock = Promise.resolve();
    }
  }
}
