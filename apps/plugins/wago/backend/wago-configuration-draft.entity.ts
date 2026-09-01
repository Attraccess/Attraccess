import { Column, Entity, PrimaryGeneratedColumn } from '@attraccess/plugins-backend-sdk';

@Entity({ name: 'plugin_wago_configuration_drafts' })
export class WagoConfigurationDraft {
  @PrimaryGeneratedColumn({ type: 'integer' }) id!: number;
  @Column({ type: 'integer', name: 'controller_id', unique: true }) controllerId!: number;
  @Column({ type: 'text' }) snapshot!: string;
  @Column({ type: 'varchar', name: 'reviewed_hash', nullable: true }) reviewedHash!: string | null;
  @Column({ type: 'text', name: 'preset_provenance', nullable: true }) presetProvenance!: string | null;
  @Column({ type: 'varchar', name: 'updated_at' }) updatedAt!: string;
}
