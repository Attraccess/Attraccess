import { Column, Entity, PrimaryColumn } from '@attraccess/plugins-backend-sdk';

/** Coordinator registers this entity and WagoManagement1780000000010. Never return it from an API. */
@Entity({ name: 'plugin_wago_management' })
export class WagoManagementEntity {
  @PrimaryColumn({ type: 'integer', name: 'controller_id' }) controllerId!: number;
  @Column({ type: 'text', name: 'metadata_json', nullable: true }) metadataJson!: string | null;
  @Column({ type: 'text', name: 'encrypted_private_key', nullable: true, select: false }) encryptedPrivateKey!:
    string | null;
  @Column({ type: 'varchar', name: 'lease_owner', nullable: true }) leaseOwner!: string | null;
  @Column({ type: 'bigint', name: 'lease_until', default: 0 }) leaseUntil!: number;
}
