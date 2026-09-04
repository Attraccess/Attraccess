import { Column, Entity, PrimaryGeneratedColumn } from '@attraccess/plugins-backend-sdk';

export type WagoCommissioningState =
  | 'awaiting_delivery'
  | 'delivering'
  | 'awaiting_identity_confirmation'
  | 'awaiting_codesys_confirmation'
  | 'delivery_failed'
  | 'awaiting_discovery'
  | 'awaiting_claim'
  | 'completed'
  | 'revoked';

@Entity({ name: 'plugin_wago_commissioning_sessions' })
export class WagoCommissioningSession {
  @PrimaryGeneratedColumn({ type: 'integer' }) id!: number;
  @Column({ type: 'varchar', name: 'hardware_id' }) hardwareId!: string;
  @Column({ type: 'integer', name: 'mqtt_server_id' }) mqttServerId!: number;
  @Column({ type: 'varchar', name: 'target_host' }) targetHost!: string;
  @Column({ type: 'varchar', name: 'host_key_fingerprint' }) hostKeyFingerprint!: string;
  @Column({ type: 'varchar', name: 'firmware_baseline' }) firmwareBaseline!: string;
  @Column({ type: 'varchar', name: 'controller_name', nullable: true }) controllerName!: string | null;
  @Column({ type: 'varchar' }) state!: WagoCommissioningState;
  @Column({ type: 'varchar', name: 'enrollment_expires_at', nullable: true }) enrollmentExpiresAt!: string | null;
  @Column({ type: 'integer', name: 'enrollment_id', nullable: true }) enrollmentId!: number | null;
  @Column({ type: 'varchar', name: 'pairing_code', nullable: true }) pairingCode!: string | null;
  @Column({ type: 'varchar', name: 'codesys_state', nullable: true }) codesysState!: string | null;
  @Column({ type: 'integer', name: 'progress_percent', nullable: true }) progressPercent!: number | null;
  @Column({ type: 'varchar', name: 'progress_step', nullable: true }) progressStep!: string | null;
  @Column({ type: 'varchar', name: 'progress_detail', nullable: true }) progressDetail!: string | null;
  @Column({ type: 'varchar', name: 'audit_log' }) auditLog!: string;
  @Column({ type: 'varchar', name: 'failure_reason', nullable: true }) failureReason!: string | null;
  @Column({ type: 'varchar', name: 'created_at' }) createdAt!: string;
  @Column({ type: 'varchar', name: 'updated_at' }) updatedAt!: string;
}
