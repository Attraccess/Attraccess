import { Column, Entity, PrimaryGeneratedColumn } from '@attraccess/plugins-backend-sdk';

@Entity({ name: 'plugin_wago_enrollments' })
export class WagoEnrollment {
  @PrimaryGeneratedColumn({ type: 'integer' }) id!: number;
  @Column({ type: 'integer', name: 'mqtt_server_id' }) mqttServerId!: number;
  @Column({ type: 'varchar', name: 'hardware_id' }) hardwareId!: string;
  @Column({ type: 'varchar', name: 'secret_hash', unique: true }) secretHash!: string;
  @Column({ type: 'varchar' }) identity!: string;
  @Column({ type: 'varchar', name: 'created_at' }) createdAt!: string;
  @Column({ type: 'varchar', name: 'expires_at' }) expiresAt!: string;
  @Column({ type: 'varchar', name: 'revoked_at', nullable: true }) revokedAt!: string | null;
  @Column({ type: 'varchar', name: 'consumed_at', nullable: true }) consumedAt!: string | null;
}
