import { WagoDeviceOperationPersistence } from './persistence/port';

export class WagoDeviceOperations {
  constructor(private readonly persistence: WagoDeviceOperationPersistence) {}
  inspect(fingerprint: string) {
    return this.persistence.inspect(fingerprint);
  }
  acquire(fingerprint: string, owner: string, now: number, until: number): Promise<boolean> {
    return this.persistence.acquire(fingerprint, owner, now, until);
  }
  async assertOwned(fingerprint: string, owner: string, now = Date.now()): Promise<void> {
    const until = await this.persistence.ownedUntil(fingerprint, owner);
    if (until === null || until <= now) throw new Error('Controller operation ownership lost');
  }
  release(fingerprint: string, owner: string): Promise<void> {
    return this.persistence.release(fingerprint, owner);
  }
}
