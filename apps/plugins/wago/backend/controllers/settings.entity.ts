import { Column, Entity, PrimaryGeneratedColumn } from '@attraccess/plugins-backend-sdk';

@Entity({ name: 'plugin_wago_settings' })
export class WagoSettings {
  @PrimaryGeneratedColumn({ type: 'integer' }) id!: number;
  @Column({ type: 'integer', name: 'default_mqtt_server_id', nullable: true }) defaultMqttServerId!: number | null;
  @Column({ type: 'varchar', name: 'operational_prefix', default: 'attraccess/wago' }) operationalPrefix!: string;
}
