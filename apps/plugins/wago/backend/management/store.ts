import type { PluginContext } from '@attraccess/plugins-backend-sdk/v2';
import type { ManagementRecord, ManagementStore, PinnedManagementSsh } from './model';
import { WagoManagementPersistence } from './persistence/port';
import { WagoManagementProvider } from './provider';
import { WagoManagementService } from './service';

export class PersistentManagementStore implements ManagementStore {
  constructor(private readonly persistence: WagoManagementPersistence) {}
  acquire(controllerId: number, owner: string, now: number, until: number): Promise<boolean> {
    return this.persistence.acquire(controllerId, owner, now, until);
  }
  async load(controllerId: number): Promise<ManagementRecord | null> {
    const row = await this.persistence.read(controllerId);
    if (!row?.metadataJson) return null;
    if (row.metadataJson.length > 16384) throw new Error('invalid_metadata');
    return { ...JSON.parse(row.metadataJson), encryptedPrivateKey: row.encryptedPrivateKey };
  }
  async save(controllerId: number, owner: string, record: ManagementRecord, now: number): Promise<void> {
    const { encryptedPrivateKey, ...metadata } = record;
    const metadataJson = JSON.stringify(metadata);
    if (metadataJson.length > 16384) throw new Error('invalid_metadata');
    if (!(await this.persistence.write(controllerId, owner, now, { metadataJson, encryptedPrivateKey })))
      throw new Error('lease_lost');
  }
  release(controllerId: number, owner: string): Promise<void> {
    return this.persistence.release(controllerId, owner);
  }
}

/** The coordinator supplies the inspected, pinned SSH seam and its recovery store. */
export function createWagoManagementService(
  context: Pick<PluginContext, 'secrets'>,
  ssh: PinnedManagementSsh,
  store: ManagementStore,
): WagoManagementService {
  return new WagoManagementService(store, context.secrets, new WagoManagementProvider(ssh));
}
