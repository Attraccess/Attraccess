import { Column, Entity, PrimaryColumn } from '@attraccess/plugins-backend-sdk';

/** New enrolments only. Never serialize this entity or its encrypted envelope. */
@Entity({ name: 'plugin_wago_managed_access' })
export class WagoManagedAccess {
  @PrimaryColumn({ type: 'integer', name: 'session_id' }) sessionId!: number;
  @Column({ type: 'integer', name: 'controller_id', nullable: true }) controllerId!: number | null;
  @Column({ type: 'varchar' }) host!: string;
  @Column({ type: 'varchar' }) fingerprint!: string;
  @Column({ type: 'varchar' }) token!: string;
  @Column({ type: 'varchar' }) state!:
    'pending' | 'verified' | 'managed' | 'recovery_required' | 'retiring' | 'retired';
  @Column({ type: 'text', name: 'encrypted_credentials', select: false }) encryptedCredentials!: string;
  @Column({ type: 'varchar', name: 'key_fingerprint' }) keyFingerprint!: string;
}

@Entity({ name: 'plugin_wago_runtime_updates' })
export class WagoRuntimeUpdateEntity {
  @PrimaryColumn({ type: 'integer', name: 'controller_id' }) controllerId!: number;
  @Column({ type: 'text', nullable: true }) metadata!: string | null;
}

/** Shared by commissioning, managed SSH and updates; keyed by pinned device identity. */
@Entity({ name: 'plugin_wago_device_operations' })
export class WagoDeviceOperation {
  @PrimaryColumn({ type: 'varchar' }) fingerprint!: string;
  @Column({ type: 'varchar', nullable: true }) owner!: string | null;
  @Column({ type: 'bigint', name: 'lease_until', default: 0 }) leaseUntil!: number;
}
