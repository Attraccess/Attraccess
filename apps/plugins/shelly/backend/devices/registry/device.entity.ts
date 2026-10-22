// SQLite metadata only. Released plugin migration owns the physical schema.
import { Column, Entity, PrimaryGeneratedColumn } from '@attraccess/plugins-backend-sdk/adapter';
import type { AuthState } from '../types';

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

  // Stored as ISO strings (varchar), set explicitly by the registry service — the
  // table predates this entity and keeps the original textual timestamp shape.
  @Column({ type: 'varchar', name: 'created_at' })
  createdAt!: string;

  @Column({ type: 'varchar', name: 'updated_at' })
  updatedAt!: string;
}
