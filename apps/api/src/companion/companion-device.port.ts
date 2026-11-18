import type { CompanionControlledResource, CompanionDeviceRecord } from '@attraccess/application-models';

export interface CompanionDeviceStore {
  /** Registers a new device with its token hash and display name. */
  registerDevice(input: { name: string; tokenHash: string }): Promise<CompanionDeviceRecord>;
  findDevice(id: number): Promise<CompanionDeviceRecord | null>;
  listDevices(): Promise<CompanionDeviceRecord[]>;
  /** Stamps the last connection time and, when reported, the app version. */
  recordConnection(id: number, appVersion?: string): Promise<void>;
  /** Persists the lock state so a restarted or offline device re-locks on its next authentication. */
  setLocked(id: number, locked: boolean): Promise<void>;
  renameDevice(id: number, name: string): Promise<CompanionDeviceRecord>;
  deleteDevice(id: number): Promise<void>;
  /** Distinct resources whose lock/unlock flow nodes reference the device. */
  findResourcesControlledBy(deviceId: number): Promise<CompanionControlledResource[]>;
}

export const COMPANION_DEVICE_STORE = Symbol.for('attraccess.companion.device-store');
