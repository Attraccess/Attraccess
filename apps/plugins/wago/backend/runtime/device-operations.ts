import { PluginStorageUniqueViolation } from '@attraccess/plugins-backend-sdk';
import type { WagoStorage } from '../storage';

/** A lease deadline as epoch milliseconds; no deadline (no lease) is 0, which every `now` has passed. */
export function leaseEnd(leaseUntil: Date | null | undefined): number {
  return leaseUntil ? leaseUntil.getTime() : 0;
}

/**
 * Lease table shared by commissioning, managed SSH and runtime updates, keyed by pinned device identity. Every state
 * transition is a compare-and-set `update`, so two replicas never both own a device.
 */
export class WagoDeviceOperations {
  constructor(private readonly table: WagoStorage['deviceOperations']) {}
  async acquire(fingerprint: string, owner: string, now: number, until: number): Promise<boolean> {
    if (!(await this.table.get(fingerprint))) {
      try {
        await this.table.insert({ fingerprint });
      } catch (error) {
        // A concurrent acquire created the row first; the compare-and-set below decides ownership.
        if (!(error instanceof PluginStorageUniqueViolation)) throw error;
      }
    }
    const claimed = await this.table.update(
      {
        and: [
          { fingerprint },
          { or: [{ owner: null }, { leaseUntil: { isNull: true } }, { leaseUntil: { lt: new Date(now) } }] },
        ],
      },
      { owner, leaseUntil: new Date(until) },
    );
    return claimed === 1;
  }
  async assertOwned(fingerprint: string, owner: string, now = Date.now()): Promise<void> {
    const row = await this.table.findOne({ where: { fingerprint, owner } });
    if (!row || leaseEnd(row.leaseUntil) <= now) throw new Error('Controller operation ownership lost');
  }
  async release(fingerprint: string, owner: string): Promise<void> {
    await this.table.update({ fingerprint, owner }, { owner: null, leaseUntil: null });
  }
}
