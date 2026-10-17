import { pluginOperationToken } from '@attraccess/plugins-backend-sdk/v2';
export interface StoredManagementEnvelope {
  metadataJson: string | null;
  encryptedPrivateKey: string | null;
}
export abstract class WagoManagementPersistence {
  abstract acquire(controllerId: number, owner: string, now: number, until: number): Promise<boolean>;
  abstract read(controllerId: number): Promise<StoredManagementEnvelope | null>;
  abstract write(
    controllerId: number,
    owner: string,
    now: number,
    envelope: StoredManagementEnvelope,
  ): Promise<boolean>;
  abstract release(controllerId: number, owner: string): Promise<void>;
}
export const WAGO_MANAGEMENT = pluginOperationToken<WagoManagementPersistence>('wago management recovery', [
  'acquire',
  'read',
  'write',
  'release',
]);
