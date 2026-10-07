import { WagoServiceClearClaimAcknowledgementOperation } from './wago.wago-service-clear-claim-acknowledgement-operation';


export abstract class WagoServiceWithClaimLockOperation extends WagoServiceClearClaimAcknowledgementOperation {
  protected async withClaimLock<T>(id: number, operation: () => Promise<T>): Promise<T> {
    const previous = this.claimLocks.get(id) ?? Promise.resolve();
    let release!: () => void;
    const lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.claimLocks.set(id, lock);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.claimLocks.get(id) === lock) this.claimLocks.delete(id);
    }
  }
}
