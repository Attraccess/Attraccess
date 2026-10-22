import type { PluginContext as LegacySqliteContext } from '@attraccess/plugins-backend-sdk';
import type { Repository } from '@attraccess/plugins-backend-sdk/adapter';
import { WagoManagementEntity } from '../entity';
import { PersistentManagementStore } from '../store';
import { StoredManagementEnvelope, WagoManagementPersistence } from './port';

export class TypeormWagoManagementPersistence extends WagoManagementPersistence {
  constructor(private readonly source: () => Repository<WagoManagementEntity>) {
    super();
  }
  private get repository() {
    return this.source();
  }
  async acquire(controllerId: number, owner: string, now: number, until: number) {
    await this.repository.createQueryBuilder().insert().values({ controllerId, leaseUntil: 0 }).orIgnore().execute();
    const result = await this.repository
      .createQueryBuilder()
      .update()
      .set({ leaseOwner: owner, leaseUntil: until })
      .where('controller_id = :controllerId AND (lease_owner IS NULL OR lease_until < :now)', { controllerId, now })
      .execute();
    return result.affected === 1;
  }
  async read(controllerId: number) {
    const row = await this.repository
      .createQueryBuilder('management')
      .addSelect('management.encryptedPrivateKey')
      .where('management.controllerId = :controllerId', { controllerId })
      .getOne();
    return row ? { metadataJson: row.metadataJson, encryptedPrivateKey: row.encryptedPrivateKey } : null;
  }
  async write(controllerId: number, owner: string, now: number, envelope: StoredManagementEnvelope) {
    const result = await this.repository
      .createQueryBuilder()
      .update()
      .set(envelope)
      .where('controller_id = :controllerId AND lease_owner = :owner AND lease_until >= :now', {
        controllerId,
        owner,
        now,
      })
      .execute();
    return result.affected === 1;
  }
  async release(controllerId: number, owner: string): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .update()
      .set({ leaseOwner: null, leaseUntil: 0 })
      .where('controller_id = :controllerId AND lease_owner = :owner', { controllerId, owner })
      .execute();
  }
}

/** Composition only; construction does not consult the host connection. */
export function createSqliteManagementStore(
  context: Pick<LegacySqliteContext, 'getRepository'>,
): PersistentManagementStore {
  return new PersistentManagementStore(
    new TypeormWagoManagementPersistence(() => context.getRepository(WagoManagementEntity)),
  );
}
