// Persisted Shelly device registry.
//
// The `plugin_shelly_devices` table is owned by a plugin migration
// (backend/migrations/*-create-shelly-devices.ts), which the host runs on boot
// before this service initialises and reverts on uninstall.
//
// CRUD goes through a real TypeORM repository over the shared connection. The
// host registers the `ShellyDevice` entity (declared via the `entities` export
// in plugin.ts) into its DataSource at load time, so `context.getRepository`
// resolves the entity's metadata — no hand-written SQL or snake_case row mapping.
// Requires the `DATABASE_ACCESS` permission (declared in plugin.json).
import { Inject, Injectable } from '@nestjs/common';
import type { PluginContext, Repository } from '@attraccess/plugins-backend-sdk';
import { ShellyDevice } from './shelly-device.entity';
import type { AuthState } from './types';

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
  private repository: Repository<ShellyDevice> | null = null;

  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  // Resolve the repository lazily, not in the constructor: plugin providers are
  // instantiated during the host's DI pass, before the host DataSource ref is
  // wired up (PluginContext.getRepository throws "Host DataSource is not
  // available yet" until bootstrap completes). The first query happens on an
  // HTTP request, well after bootstrap, so resolving on demand is safe; cache it
  // once resolved.
  private get devices(): Repository<ShellyDevice> {
    if (this.repository === null) {
      this.repository = this.context.getRepository(ShellyDevice);
    }
    return this.repository;
  }

  list(): Promise<ShellyDevice[]> {
    return this.devices.find({ order: { createdAt: 'ASC', id: 'ASC' } });
  }

  findById(id: number): Promise<ShellyDevice | null> {
    return this.devices.findOne({ where: { id } });
  }

  findByIp(ipAddress: string): Promise<ShellyDevice | null> {
    return this.devices.findOne({ where: { ipAddress } });
  }

  create(input: { name: string; ipAddress: string } & DeviceProbeFields): Promise<ShellyDevice> {
    const now = new Date().toISOString();
    const device = this.devices.create({
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
    return this.devices.save(device);
  }

  async updateProbe(id: number, patch: DeviceProbeFields): Promise<void> {
    await this.devices.update(id, {
      generation: patch.generation,
      model: patch.model,
      authState: patch.authState,
      lastProbeAt: patch.lastProbeAt,
      lastProbeError: patch.lastProbeError,
      updatedAt: new Date().toISOString(),
    });
  }

  async updateAuthState(id: number, authState: AuthState): Promise<void> {
    await this.devices.update(id, {
      authState,
      updatedAt: new Date().toISOString(),
    });
  }

  async delete(id: number): Promise<void> {
    await this.devices.delete(id);
  }
}
