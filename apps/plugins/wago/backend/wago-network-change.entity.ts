import { Column, Entity, PrimaryColumn } from '@attraccess/plugins-backend-sdk';

export type WagoNetworkChangePhase = 'connecting' | 'provisioning' | 'applying' | 'verifying' | 'saving' | 'completed';

/** Durable roll-forward intent. Only an explicit public projection may leave the backend. */
@Entity({ name: 'plugin_wago_network_changes' })
export class WagoNetworkChange {
  @PrimaryColumn({ type: 'integer', name: 'controller_id' }) controllerId!: number;
  @Column({ type: 'integer', name: 'session_id' }) sessionId!: number;
  @Column({ type: 'varchar' }) fingerprint!: string;
  @Column({ type: 'varchar', name: 'target_host' }) targetHost!: string;
  @Column({ type: 'integer', name: 'mqtt_server_id', nullable: true }) mqttServerId!: number | null;
  @Column({ type: 'varchar' }) phase!: WagoNetworkChangePhase;
  @Column({ type: 'varchar', nullable: true }) failure!: string | null;
  @Column({ type: 'text', name: 'encrypted_payload', nullable: true, select: false }) encryptedPayload!: string | null;
  @Column({ type: 'varchar', name: 'updated_at' }) updatedAt!: string;
}

/** Retain the old identity's broker association when it cannot be contacted.
 * Migration success never relies on revocation through an unreachable broker.
 */
@Entity({ name: 'plugin_wago_mqtt_credential_retirements' })
export class WagoMqttCredentialRetirement {
  @PrimaryColumn({ type: 'integer', name: 'controller_id' }) controllerId!: number;
  @PrimaryColumn({ type: 'integer', name: 'mqtt_server_id' }) mqttServerId!: number;
}
