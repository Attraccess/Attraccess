import type { PluginContext, Repository } from '@attraccess/plugins-backend-sdk';
import { WagoManagementEntity } from './wago-management.entity';
import type { ManagementRecord, ManagementStore, PinnedManagementSsh } from './wago-management.types';
import { WagoManagementProvider } from './wago-management-provider';
import { WagoManagementService } from './wago-management';

export class RepositoryManagementStore implements ManagementStore {
  constructor(private readonly repository: Repository<WagoManagementEntity>) {}
  async acquire(controllerId: number, owner: string, now: number, until: number): Promise<boolean> {
    await this.repository.createQueryBuilder().insert().values({ controllerId, leaseUntil: 0 }).orIgnore().execute();
    const result = await this.repository
      .createQueryBuilder()
      .update()
      .set({ leaseOwner: owner, leaseUntil: until })
      .where('controller_id = :controllerId AND (lease_owner IS NULL OR lease_until < :now)', { controllerId, now })
      .execute();
    return result.affected === 1;
  }
  async load(controllerId: number): Promise<ManagementRecord | null> {
    const row = await this.repository
      .createQueryBuilder('management')
      .addSelect('management.encryptedPrivateKey')
      .where('management.controllerId = :controllerId', { controllerId })
      .getOne();
    if (!row?.metadataJson) return null;
    if (row.metadataJson.length > 16384) throw new Error('invalid_metadata');
    return { ...JSON.parse(row.metadataJson), encryptedPrivateKey: row.encryptedPrivateKey };
  }
  async save(controllerId: number, owner: string, record: ManagementRecord, now: number): Promise<void> {
    const { encryptedPrivateKey, ...metadata } = record;
    const metadataJson = JSON.stringify(metadata);
    if (metadataJson.length > 16384) throw new Error('invalid_metadata');
    const result = await this.repository
      .createQueryBuilder()
      .update()
      .set({ metadataJson, encryptedPrivateKey })
      .where('controller_id = :controllerId AND lease_owner = :owner AND lease_until >= :now', {
        controllerId,
        owner,
        now,
      })
      .execute();
    if (result.affected !== 1) throw new Error('lease_lost');
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

/** Exact integration factory: context repository/secrets + the coordinator's inspected, pinned SSH seam.
 * Register entity/migration separately. This factory performs no network calls or device discovery.
 */
export function createWagoManagementService(
  context: Pick<PluginContext, 'getRepository' | 'secrets'>,
  ssh: PinnedManagementSsh,
): WagoManagementService {
  return new WagoManagementService(
    new RepositoryManagementStore(context.getRepository(WagoManagementEntity)),
    context.secrets,
    new WagoManagementProvider(ssh),
  );
}
