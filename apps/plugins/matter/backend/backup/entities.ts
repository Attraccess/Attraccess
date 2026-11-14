// Entities of the backup feature. The schema belongs to migrations/1793900002000-create-matter-backup.ts.
import { Column, Entity, PrimaryColumn } from '@attraccess/plugins-backend-sdk';

export type BackupTrigger = 'manual' | 'fabric_created' | 'restore' | 'daily' | 'fabric_changed' | 'pre_restore';
export const BACKUP_TRIGGERS: readonly BackupTrigger[] = [
  'manual',
  'fabric_created',
  'restore',
  'daily',
  'fabric_changed',
  'pre_restore',
];

/** A recovery key. Only `encryptedKey` (encrypted with the host's plugin secrets) is stored, never the key itself. */
@Entity({ name: 'plugin_matter_recovery_keys' })
export class MatterRecoveryKey {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({ type: 'varchar', name: 'key_id' })
  keyId!: string;

  @Column({ type: 'text', name: 'encrypted_key' })
  encryptedKey!: string;

  @Column({ type: 'varchar', name: 'created_at' })
  createdAt!: string;

  @Column({ type: 'varchar', name: 'acknowledged_at', nullable: true })
  acknowledgedAt!: string | null;

  /** Set when the key was rotated out. The current key is the one without it. */
  @Column({ type: 'varchar', name: 'retired_at', nullable: true })
  retiredAt!: string | null;
}

/**
 * One backup attempt. A successful one carries the encrypted file in `blob`; a failed one only a non-secret `reason`
 * code. Never part of a backup itself.
 */
@Entity({ name: 'plugin_matter_backups' })
export class MatterBackup {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({ type: 'varchar', name: 'created_at' })
  createdAt!: string;

  @Column({ type: 'varchar' })
  trigger!: BackupTrigger;

  /** The administrator who asked for it; null for the plugin's own scheduled and event-driven backups. */
  @Column({ type: 'integer', nullable: true })
  actor!: number | null;

  @Column({ type: 'varchar' })
  outcome!: 'succeeded' | 'failed';

  @Column({ type: 'varchar', nullable: true })
  reason!: string | null;

  @Column({ type: 'integer', name: 'size_bytes', nullable: true })
  sizeBytes!: number | null;

  @Column({ type: 'varchar', nullable: true })
  sha256!: string | null;

  @Column({ type: 'integer', name: 'format_version', nullable: true })
  formatVersion!: number | null;

  @Column({ type: 'varchar', name: 'plugin_version', nullable: true })
  pluginVersion!: string | null;

  @Column({ type: 'varchar', name: 'sidecar_version', nullable: true })
  sidecarVersion!: string | null;

  @Column({ type: 'varchar', name: 'matter_js_version', nullable: true })
  matterJsVersion!: string | null;

  @Column({ type: 'integer', name: 'storage_schema_version', nullable: true })
  storageSchemaVersion!: number | null;

  @Column({ type: 'varchar', name: 'plugin_migration', nullable: true })
  pluginMigration!: string | null;

  @Column({ type: 'varchar', name: 'fabric_id', nullable: true })
  fabricId!: string | null;

  @Column({ type: 'varchar', name: 'root_cert_fingerprint', nullable: true })
  rootCertFingerprint!: string | null;

  @Column({ type: 'integer', name: 'fabric_generation', nullable: true })
  fabricGeneration!: number | null;

  @Column({ type: 'varchar', name: 'storage_instance_id', nullable: true })
  storageInstanceId!: string | null;

  @Column({ type: 'varchar', name: 'recovery_key_id', nullable: true })
  recoveryKeyId!: string | null;

  /**
   * `false` for a backup whose plugin tables did not agree with the sidecar snapshot (a pre-restore backup taken in
   * recovery); the same flag is in the file's authenticated header. Null for a failed attempt.
   */
  @Column({ type: 'boolean', nullable: true })
  consistent!: boolean | null;

  @Column({ type: 'blob', nullable: true })
  blob!: Buffer | null;
}

export const BACKUP_ENTITIES = [MatterRecoveryKey, MatterBackup];
