import { pluginOperationToken } from '@attraccess/plugins-backend-sdk/v2';
export abstract class WagoDeviceOperationPersistence {
  abstract inspect(fingerprint: string): Promise<{ owner: string | null; leaseUntil: number } | null>;
  abstract acquire(fingerprint: string, owner: string, now: number, until: number): Promise<boolean>;
  abstract ownedUntil(fingerprint: string, owner: string): Promise<number | null>;
  abstract release(fingerprint: string, owner: string): Promise<void>;
}
export const WAGO_DEVICE_LEASES = pluginOperationToken<WagoDeviceOperationPersistence>('wago device operation leases', [
  'inspect',
  'acquire',
  'ownedUntil',
  'release',
]);
