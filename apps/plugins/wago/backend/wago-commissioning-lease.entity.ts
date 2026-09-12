import { Column, Entity, PrimaryColumn } from '@attraccess/plugins-backend-sdk';

/** Register with the plugin's shared datasource; never synchronize a private datasource. */
@Entity({ name: 'plugin_wago_commissioning_lease' })
export class WagoCommissioningLeaseEntity {
  @PrimaryColumn({ type: 'varchar', name: 'fingerprint_hash', length: 64 }) fingerprintHash!: string;
  @Column({ type: 'varchar', name: 'owner' }) owner!: string;
  @Column({ type: 'bigint', name: 'lease_until' }) leaseUntil!: number;
  @Column({ type: 'bigint', name: 'operation_until' }) operationUntil!: number;
  @Column({ type: 'bigint', name: 'recovery_after' }) recoveryAfter!: number;
}
