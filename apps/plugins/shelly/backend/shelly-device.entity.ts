// TypeORM entity for the Shelly device registry.
//
// The schema is owned by the plugin migration
// (backend/migrations/*-create-shelly-devices.ts) — the host runs with
// `synchronize: false`, so this entity only *describes* the existing
// `plugin_shelly_devices` table for repository access; it never creates or
// alters it. Column names/types therefore mirror the migration exactly.
//
// The host registers this class into the shared DataSource (declared via the
// `entities` export in plugin.ts) so `context.getRepository(ShellyDevice)`
// resolves. Decorators are imported from the SDK, which re-exports the host's
// single TypeORM copy — never add a `typeorm` dependency to the plugin.
//
// NOTE: the bundler (esbuild) does not emit decorator *type* metadata, so every
// column declares an explicit `type`.
import { Column, Entity, PrimaryGeneratedColumn } from '@attraccess/plugins-backend-sdk';
import type { AuthState, DeviceTransport } from './types';

// Namespaced so the plugin's table never collides with a host table.
@Entity({ name: 'plugin_shelly_devices' })
export class ShellyDevice {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'varchar', name: 'ip_address', unique: true })
  ipAddress!: string;

  /** Shelly generation: 1 for Gen1, 2/3/… for Gen2+. Null until first probe. */
  @Column({ type: 'integer', nullable: true })
  generation!: number | null;

  /** Device model string (Gen2+ `model`, Gen1 `type`). Null until first probe. */
  @Column({ type: 'varchar', nullable: true })
  model!: string | null;

  @Column({ type: 'varchar', name: 'auth_state', default: 'unknown' })
  authState!: AuthState;

  /** ISO timestamp of the last probe attempt, or null if never attempted. */
  @Column({ type: 'varchar', name: 'last_probe_at', nullable: true })
  lastProbeAt!: string | null;

  /** Error message from the last probe attempt, or null if the last probe succeeded. */
  @Column({ type: 'varchar', name: 'last_probe_error', nullable: true })
  lastProbeError!: string | null;

  /**
   * How Attraccess talks to this device. `wifi-mqtt` devices run their own MQTT
   * client (ATT-499); `zigbee` devices are reached through the zigbee2mqtt
   * gateway and never get device-side MQTT config. Flipped to `zigbee` only once
   * pairing succeeds — a Zigbee-*capable* device that is not paired yet is still
   * driven over WiFi.
   */
  @Column({ type: 'varchar', default: 'wifi-mqtt' })
  transport!: DeviceTransport;

  /**
   * Whether the device exposes the `Zigbee.*` RPC surface, as learned from a
   * probe. Null until first probed.
   *
   * Stored as an integer because SQLite has no native boolean, so the column
   * needs an explicit transformer — without it the API would serialise `1`/`0`
   * and every strict `=== true` check on the client would silently fail.
   */
  @Column({
    type: 'integer',
    name: 'zigbee_capable',
    nullable: true,
    transformer: {
      to: (value: boolean | null) => (value === null || value === undefined ? null : value ? 1 : 0),
      from: (value: number | null) => (value === null || value === undefined ? null : value === 1),
    },
  })
  zigbeeCapable!: boolean | null;

  /** z2m IEEE address (`0x…`) once paired. The stable key for topics. */
  @Column({ type: 'varchar', name: 'zigbee_ieee_address', nullable: true })
  zigbeeIeeeAddress!: string | null;

  /** Attraccess-controlled z2m friendly name, so topics don't follow the z2m UI. */
  @Column({ type: 'varchar', name: 'zigbee_friendly_name', nullable: true })
  zigbeeFriendlyName!: string | null;

  // Stored as ISO strings (varchar), set explicitly by the registry service — the
  // table predates this entity and keeps the original textual timestamp shape.
  @Column({ type: 'varchar', name: 'created_at' })
  createdAt!: string;

  @Column({ type: 'varchar', name: 'updated_at' })
  updatedAt!: string;
}
