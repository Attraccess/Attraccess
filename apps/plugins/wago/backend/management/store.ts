import { PluginStorageUniqueViolation, type PluginContext } from '@attraccess/plugins-backend-sdk';
import { openWagoStorage, type WagoStorage } from '../storage';
import type { ManagementRecord, ManagementStore, PinnedManagementSsh } from './model';
import { WagoManagementProvider } from './provider';
import { WagoManagementService } from './service';

type ManagementTable = WagoStorage['management'];

export class RepositoryManagementStore implements ManagementStore {
  constructor(private readonly table: ManagementTable) {}
  async acquire(controllerId: number, owner: string, now: number, until: number): Promise<boolean> {
    // Ensure the lease row exists (insert-or-ignore), then take it with a compare-and-set.
    await this.table.insert({ controllerId, leaseUntil: 0 }).catch((error) => {
      if (!(error instanceof PluginStorageUniqueViolation)) throw error;
    });
    const affected = await this.table.update(
      { and: [{ controllerId }, { or: [{ leaseOwner: { isNull: true } }, { leaseUntil: { lt: now } }] }] },
      { leaseOwner: owner, leaseUntil: until },
    );
    return affected === 1;
  }
  async load(controllerId: number): Promise<ManagementRecord | null> {
    const row = await this.table.get(controllerId);
    if (!row?.metadataJson) return null;
    if (row.metadataJson.length > 16384) throw new Error('invalid_metadata');
    return { ...JSON.parse(row.metadataJson), encryptedPrivateKey: row.encryptedPrivateKey };
  }
  async save(controllerId: number, owner: string, record: ManagementRecord, now: number): Promise<void> {
    const { encryptedPrivateKey, ...metadata } = record;
    const metadataJson = JSON.stringify(metadata);
    if (metadataJson.length > 16384) throw new Error('invalid_metadata');
    const affected = await this.table.update(
      { controllerId, leaseOwner: owner, leaseUntil: { gte: now } },
      { metadataJson, encryptedPrivateKey },
    );
    if (affected !== 1) throw new Error('lease_lost');
  }
  async release(controllerId: number, owner: string): Promise<void> {
    await this.table.update({ controllerId, leaseOwner: owner }, { leaseOwner: null, leaseUntil: 0 });
  }
}

/** Exact integration factory: context storage/secrets + the coordinator's inspected, pinned SSH seam.
 * Its table is part of the plugin's declared storage. This factory performs no network calls or device discovery.
 */
export function createWagoManagementService(
  context: Pick<PluginContext, 'storage' | 'persistence' | 'secrets'>,
  ssh: PinnedManagementSsh,
): WagoManagementService {
  return new WagoManagementService(
    new RepositoryManagementStore(openWagoStorage(context).management),
    context.secrets,
    new WagoManagementProvider(ssh),
  );
}
