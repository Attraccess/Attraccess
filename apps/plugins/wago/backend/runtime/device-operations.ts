import type { Repository } from '@attraccess/plugins-backend-sdk';
import { WagoDeviceOperation } from './managed/access.entity';

export class WagoDeviceOperations {
  constructor(private readonly repository: Repository<WagoDeviceOperation>) {}
  async acquire(fingerprint: string, owner: string, now: number, until: number): Promise<boolean> {
    await this.repository.createQueryBuilder().insert().values({ fingerprint, leaseUntil: 0 }).orIgnore().execute();
    const result = await this.repository
      .createQueryBuilder()
      .update()
      .set({ owner, leaseUntil: until })
      .where('fingerprint = :fingerprint AND (owner IS NULL OR lease_until < :now)', { fingerprint, now })
      .execute();
    return result.affected === 1;
  }
  async assertOwned(fingerprint: string, owner: string, now = Date.now()): Promise<void> {
    const row = await this.repository.findOneBy({ fingerprint, owner });
    if (!row || Number(row.leaseUntil) <= now) throw new Error('Controller operation ownership lost');
  }
  async release(fingerprint: string, owner: string): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .update()
      .set({ owner: null, leaseUntil: 0 })
      .where('fingerprint = :fingerprint AND owner = :owner', { fingerprint, owner })
      .execute();
  }
}
