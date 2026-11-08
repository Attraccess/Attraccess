import { Column, Entity, PrimaryColumn } from '@attraccess/plugins-backend-sdk';

/** Plugin-wide key/value settings (currently only `timezone`). */
@Entity({ name: 'reservations_global_settings' })
export class GlobalSettingsEntity {
  @PrimaryColumn({ type: 'varchar' })
  key!: string;

  @Column({ type: 'text' })
  value!: string;
}
