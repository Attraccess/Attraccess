import type { PluginContext as LegacySqliteContext } from '@attraccess/plugins-backend-sdk';
import type { Repository } from '@attraccess/plugins-backend-sdk/adapter';
import { WagoDeviceOperation } from '../managed/access.entity';
import { WagoDeviceOperations } from '../device-operations';
import { WagoDeviceOperationPersistence } from './port';

export class TypeormWagoDeviceOperationPersistence extends WagoDeviceOperationPersistence {
  constructor(private readonly source: () => Repository<WagoDeviceOperation>) {
    super();
  }
  private get repository() {
    return this.source();
  }
  async inspect(fingerprint: string) {
    const row = await this.repository.findOneBy({ fingerprint });
    return row ? { owner: row.owner, leaseUntil: Number(row.leaseUntil) } : null;
  }
  async acquire(fingerprint: string, owner: string, now: number, until: number) {
    await this.repository.createQueryBuilder().insert().values({ fingerprint, leaseUntil: 0 }).orIgnore().execute();
    const result = await this.repository
      .createQueryBuilder()
      .update()
      .set({ owner, leaseUntil: until })
      .where('fingerprint = :fingerprint AND (owner IS NULL OR lease_until < :now)', { fingerprint, now })
      .execute();
    return result.affected === 1;
  }
  async ownedUntil(fingerprint: string, owner: string) {
    const row = await this.repository.findOneBy({ fingerprint, owner });
    return row ? Number(row.leaseUntil) : null;
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

export function createSqliteDeviceOperations(
  context: Pick<LegacySqliteContext, 'getRepository'>,
): WagoDeviceOperations {
  return new WagoDeviceOperations(
    new TypeormWagoDeviceOperationPersistence(() => context.getRepository(WagoDeviceOperation)),
  );
}
