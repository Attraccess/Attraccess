// Persisted Shelly device registry.
//
// The `plugin_shelly_devices` table is owned by a plugin migration
// (backend/migrations/*-create-shelly-devices.ts), which the host runs on boot
// before this service initialises and reverts on uninstall — so we no longer
// create the table from `onModuleInit`.
//
// We still drive it with raw SQL over the shared connection rather than a
// TypeORM entity/repository: the host DataSource is initialised with a fixed
// entity set (`@attraccess/database-entities`) and `synchronize:false`, and the
// plugin-migration runner uses a throwaway DataSource with `entities: []`.
// Neither registers a plugin's own entity, so `context.getRepository(ShellyDevice)`
// would throw "No metadata found" in production. Raw SQL keeps the plugin schema
// self-contained, matching the plugin sandbox boundary. Requires the
// `DATABASE_ACCESS` permission (declared in plugin.json) to reach
// `context.dataSource`.
import { Inject, Injectable } from '@nestjs/common';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import type { AuthState, ShellyDevice } from './types';

// The host hands each plugin its PluginContext under this token. Recreate it
// locally (do not import the value) so the artifact has no runtime dependency on
// the SDK: Symbol.for() resolves against the process-global registry.
const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');

// Namespaced so the plugin's table never collides with a host table.
const TABLE = 'plugin_shelly_devices';

/** Raw snake_case row as returned by sqlite. */
interface DeviceRow {
  id: number;
  name: string;
  ip_address: string;
  generation: number | null;
  model: string | null;
  auth_state: string;
  last_probe_at: string | null;
  last_probe_error: string | null;
  created_at: string;
  updated_at: string;
}

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
  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  async list(): Promise<ShellyDevice[]> {
    const rows = await this.run<DeviceRow[]>(`SELECT * FROM ${TABLE} ORDER BY created_at ASC, id ASC`);
    return rows.map(mapRow);
  }

  async findById(id: number): Promise<ShellyDevice | null> {
    const rows = await this.run<DeviceRow[]>(`SELECT * FROM ${TABLE} WHERE id = ? LIMIT 1`, [id]);
    return rows.length ? mapRow(rows[0]) : null;
  }

  async findByIp(ipAddress: string): Promise<ShellyDevice | null> {
    const rows = await this.run<DeviceRow[]>(`SELECT * FROM ${TABLE} WHERE ip_address = ? LIMIT 1`, [ipAddress]);
    return rows.length ? mapRow(rows[0]) : null;
  }

  async create(input: { name: string; ipAddress: string } & DeviceProbeFields): Promise<ShellyDevice> {
    const now = new Date().toISOString();
    await this.run(
      `INSERT INTO ${TABLE}
        (name, ip_address, generation, model, auth_state, last_probe_at, last_probe_error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.name,
        input.ipAddress,
        input.generation,
        input.model,
        input.authState,
        input.lastProbeAt,
        input.lastProbeError,
        now,
        now,
      ]
    );
    const created = await this.findByIp(input.ipAddress);
    if (!created) {
      throw new Error(`failed to load device after insert (ip ${input.ipAddress})`);
    }
    return created;
  }

  async updateProbe(id: number, patch: DeviceProbeFields): Promise<void> {
    await this.run(
      `UPDATE ${TABLE}
         SET generation = ?, model = ?, auth_state = ?, last_probe_at = ?, last_probe_error = ?, updated_at = ?
       WHERE id = ?`,
      [patch.generation, patch.model, patch.authState, patch.lastProbeAt, patch.lastProbeError, new Date().toISOString(), id]
    );
  }

  async delete(id: number): Promise<void> {
    await this.run(`DELETE FROM ${TABLE} WHERE id = ?`, [id]);
  }

  private run<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
    return this.context.dataSource.query(sql, params) as Promise<T>;
  }
}

function mapRow(row: DeviceRow): ShellyDevice {
  return {
    id: row.id,
    name: row.name,
    ipAddress: row.ip_address,
    generation: row.generation,
    model: row.model,
    authState: row.auth_state as AuthState,
    lastProbeAt: row.last_probe_at,
    lastProbeError: row.last_probe_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
