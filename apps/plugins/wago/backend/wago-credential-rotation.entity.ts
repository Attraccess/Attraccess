import { Column, Entity, PrimaryColumn } from '@attraccess/plugins-backend-sdk';

/** Never expose this recovery record through an API. */
@Entity({ name: 'plugin_wago_credential_rotations' })
export class WagoCredentialRotationEntity {
  @PrimaryColumn({ type: 'integer', name: 'controller_id' }) controllerId!: number;
  @Column({ type: 'integer' }) revision!: number;
  @Column({ type: 'varchar' }) phase!: 'provisioning' | 'pending' | 'completed';
  @Column({ type: 'integer', name: 'mqtt_server_id' }) mqttServerId!: number;
  @Column({ type: 'varchar' }) prefix!: string;
  @Column({ type: 'varchar' }) token!: string;
  @Column({ type: 'text', name: 'encrypted_credentials', nullable: true, select: false }) encryptedCredentials!:
    string | null;
}
