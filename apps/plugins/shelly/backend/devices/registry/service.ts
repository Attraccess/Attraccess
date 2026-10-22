import { Inject, Injectable } from '@nestjs/common';
import type { PluginContext } from '@attraccess/plugins-backend-sdk/v2';
import { SHELLY_DEVICES } from './persistence/port';
import type { DeviceProbeFields } from './persistence/port';
import type { ShellyDevice } from './device.record';
import type { AuthState } from '../types';
export type { DeviceProbeFields } from './persistence/port';

@Injectable()
export class DeviceRegistryService {
  constructor(@Inject(Symbol.for('attraccess.plugin.context')) private readonly context: PluginContext) {}

  private get devices() {
    return this.context.persistence.resolve(SHELLY_DEVICES);
  }

  list(): Promise<ShellyDevice[]> {
    return this.devices.list();
  }
  findById(id: number): Promise<ShellyDevice | null> {
    return this.devices.findById(id);
  }
  findByIp(ipAddress: string): Promise<ShellyDevice | null> {
    return this.devices.findByIp(ipAddress);
  }

  create(input: { name: string; ipAddress: string } & DeviceProbeFields): Promise<ShellyDevice> {
    const now = new Date().toISOString();
    return this.devices.create({
      name: input.name,
      ipAddress: input.ipAddress,
      generation: input.generation,
      model: input.model,
      authState: input.authState,
      lastProbeAt: input.lastProbeAt,
      lastProbeError: input.lastProbeError,
      createdAt: now,
      updatedAt: now,
    });
  }
  updateProbe(id: number, patch: DeviceProbeFields): Promise<void> {
    return this.devices.updateProbe(id, patch, new Date().toISOString());
  }
  updateAuthState(id: number, authState: AuthState): Promise<void> {
    return this.devices.updateAuthState(id, authState, new Date().toISOString());
  }
  delete(id: number): Promise<void> {
    return this.devices.remove(id);
  }
}
