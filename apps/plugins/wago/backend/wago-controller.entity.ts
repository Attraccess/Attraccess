import { Column, Entity, PrimaryGeneratedColumn } from '@attraccess/plugins-backend-sdk';

export type WagoTrustState = 'untrusted' | 'claimed';

@Entity({ name: 'plugin_wago_controllers' })
export class WagoController {
  @PrimaryGeneratedColumn({ type: 'integer' }) id!: number;
  @Column({ type: 'varchar', name: 'hardware_id', unique: true }) hardwareId!: string;
  @Column({ type: 'varchar', name: 'trust_state' }) trustState!: WagoTrustState;
  @Column({ type: 'varchar', nullable: true }) name!: string | null;
  @Column({ type: 'integer', name: 'mqtt_server_id', nullable: true }) mqttServerId!: number | null;
  /** Durable permanent-identity provisioning intent, retained until confirmed revocation. */
  @Column({ type: 'integer', name: 'credential_mqtt_server_id', nullable: true }) credentialMqttServerId?:
    number | null;
  @Column({ type: 'varchar', name: 'credential_epoch', nullable: true }) credentialEpoch?: string | null;
  @Column({ type: 'integer', name: 'enrollment_id', nullable: true }) enrollmentId!: number | null;
  @Column({ type: 'varchar', name: 'pairing_code_hash' }) pairingCodeHash!: string;
  @Column({ type: 'varchar', nullable: true }) fingerprint!: string | null;
  @Column({ type: 'varchar', name: 'protocol_version' }) protocolVersion!: string;
  @Column({ type: 'varchar', name: 'runtime_version' }) runtimeVersion!: string;
  @Column({ type: 'varchar' }) capabilities!: string;
  @Column({ type: 'integer', name: 'last_sequence', default: 0 }) lastSequence!: number;
  @Column({ type: 'varchar', name: 'last_heartbeat_at', nullable: true }) lastHeartbeatAt!: string | null;
  @Column({ type: 'varchar', name: 'last_seen_at' }) lastSeenAt!: string;
  @Column({ type: 'varchar', name: 'compatibility_error', nullable: true }) compatibilityError!: string | null;
  @Column({ type: 'varchar', name: 'created_at' }) createdAt!: string;
  @Column({ type: 'varchar', name: 'updated_at' }) updatedAt!: string;
}
