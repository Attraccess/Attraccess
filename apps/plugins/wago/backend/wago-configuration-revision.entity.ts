import { Column, Entity, PrimaryGeneratedColumn } from '@attraccess/plugins-backend-sdk';

export type WagoConfigurationRevisionState = 'pending' | 'published' | 'applied' | 'rejected';

@Entity({ name: 'plugin_wago_configuration_revisions' })
export class WagoConfigurationRevision {
  @PrimaryGeneratedColumn({ type: 'integer' }) id!: number;
  @Column({ type: 'integer', name: 'controller_id' }) controllerId!: number;
  @Column({ type: 'integer' }) revision!: number;
  @Column({ type: 'text' }) snapshot!: string;
  @Column({ type: 'varchar', name: 'content_hash' }) contentHash!: string;
  @Column({ type: 'varchar' }) state!: WagoConfigurationRevisionState;
  @Column({ type: 'text', name: 'rejection_errors', nullable: true }) rejectionErrors!: string | null;
  @Column({ type: 'varchar', name: 'published_at' }) publishedAt!: string;
  @Column({ type: 'varchar', name: 'reported_at', nullable: true }) reportedAt!: string | null;
}
