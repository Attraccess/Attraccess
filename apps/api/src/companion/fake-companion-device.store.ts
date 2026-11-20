import type { CompanionControlledResource, CompanionDeviceRecord } from '@attraccess/application-models';
import type { CompanionDeviceStore } from './companion-device.port';

/** In-memory CompanionDeviceStore for unit tests. */
export class FakeCompanionDeviceStore implements CompanionDeviceStore {
  readonly devices = new Map<number, CompanionDeviceRecord>();
  readonly controlledResources = new Map<number, CompanionControlledResource[]>();
  private nextId = 1;

  async registerDevice(input: { name: string; tokenHash: string }): Promise<CompanionDeviceRecord> {
    const now = new Date();
    const device: CompanionDeviceRecord = {
      id: this.nextId++,
      name: input.name,
      tokenHash: input.tokenHash,
      resources: [],
      locked: false,
      lastConnection: now,
      firstConnection: now,
      appVersion: null,
    };
    this.devices.set(device.id, device);
    return { ...device };
  }

  async findDevice(id: number): Promise<CompanionDeviceRecord | null> {
    const device = this.devices.get(id);
    return device ? { ...device } : null;
  }

  async listDevices(): Promise<CompanionDeviceRecord[]> {
    return [...this.devices.values()].map((device) => ({ ...device }));
  }

  async recordConnection(id: number, appVersion?: string): Promise<void> {
    const device = this.devices.get(id);
    if (!device) return;
    device.lastConnection = new Date();
    if (appVersion !== undefined) device.appVersion = appVersion;
  }

  async setLocked(id: number, locked: boolean): Promise<void> {
    const device = this.devices.get(id);
    if (device) device.locked = locked;
  }

  async renameDevice(id: number, name: string): Promise<CompanionDeviceRecord> {
    const device = this.devices.get(id);
    if (!device) throw new Error(`Companion device ${id} not found`);
    device.name = name;
    return { ...device };
  }

  async deleteDevice(id: number): Promise<void> {
    this.devices.delete(id);
  }

  async findResourcesControlledBy(deviceId: number): Promise<CompanionControlledResource[]> {
    return this.controlledResources.get(deviceId) ?? [];
  }
}
