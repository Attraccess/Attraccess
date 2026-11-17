// Persisted Shelly device registry.
//
// The `plugin_shelly_devices` table is declared in ./storage.ts; the host creates, adopts and migrates it. CRUD goes
// through the record port (`context.storage`, requires the PLUGIN_STORAGE permission declared in plugin.json).
import { Inject, Injectable } from '@nestjs/common';
import type { PluginContext, PluginStorageTablesApi } from '@attraccess/plugins-backend-sdk';
import { shellyStorage, type ShellyDevice } from './storage';
import type { AuthState } from '../types';

// The host hands each plugin its PluginContext under this token. Recreate it
// locally (do not import the value) so the artifact has no runtime dependency on
// the SDK: Symbol.for() resolves against the process-global registry.
const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');

/** Fields written by a probe (on add or re-probe). */
export interface DeviceProbeFields {
  generation: number | null;
  model: string | null;
  authState: AuthState;
  lastProbeAt: string | null;
  lastProbeError: string | null;
}

@Injectable()
export class DeviceRegistryService {
  private tables: PluginStorageTablesApi<typeof shellyStorage.tables> | null = null;

  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  // Open the tables lazily, not in the constructor: plugin providers are instantiated during the host's DI pass,
  // before the storage is served. The first query happens on an HTTP request, well after bootstrap.
  private get devices() {
    if (this.tables === null) {
      this.tables = this.context.storage.open(shellyStorage);
    }
    return this.tables.devices;
  }

  async list(): Promise<ShellyDevice[]> {
    const rows = await this.devices.find({
      orderBy: [
        { field: 'createdAt', direction: 'asc' },
        { field: 'id', direction: 'asc' },
      ],
    });
    return rows as ShellyDevice[];
  }

  async findById(id: number): Promise<ShellyDevice | null> {
    return (await this.devices.findOne({ where: { id } })) as ShellyDevice | null;
  }

  async findByIp(ipAddress: string): Promise<ShellyDevice | null> {
    return (await this.devices.findOne({ where: { ipAddress } })) as ShellyDevice | null;
  }

  async create(input: { name: string; ipAddress: string } & DeviceProbeFields): Promise<ShellyDevice> {
    const now = new Date().toISOString();
    const row = await this.devices.insert({
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
    return row as ShellyDevice;
  }

  async updateProbe(id: number, patch: DeviceProbeFields): Promise<void> {
    await this.devices.update(
      { id },
      {
        generation: patch.generation,
        model: patch.model,
        authState: patch.authState,
        lastProbeAt: patch.lastProbeAt,
        lastProbeError: patch.lastProbeError,
        updatedAt: new Date().toISOString(),
      },
    );
  }

  async updateAuthState(id: number, authState: AuthState): Promise<void> {
    await this.devices.update({ id }, { authState, updatedAt: new Date().toISOString() });
  }

  async delete(id: number): Promise<void> {
    await this.devices.delete({ id });
  }
}
