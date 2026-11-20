import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Attractap } from './attractap.entity';

/**
 * A logical BLE endpoint owned by exactly one backend plugin: a reader, a device address and a profile the
 * plugin registered. Host detail of the plugin BLE transport; plugins see it only as the SDK's
 * `PluginBleEndpoint` through `context.ble` and must not touch these rows through repository access.
 * The one-address-one-plugin rule is enforced by the service, not by the schema.
 */
@Entity('plugin_ble_endpoint')
@Index('UQ_plugin_ble_endpoint_plugin_reader_address', ['pluginId', 'readerId', 'address'], { unique: true })
@Index('IDX_plugin_ble_endpoint_address', ['address'])
export class PluginBleEndpointEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_plugin_ble_endpoint_plugin')
  @Column({ type: 'text' })
  pluginId!: string;

  @Column({ type: 'integer' })
  readerId!: number;

  @ManyToOne(() => Attractap, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'readerId' })
  reader?: Attractap;

  @Column({ type: 'text' })
  address!: string;

  @Column({ type: 'text' })
  addressType!: 'public' | 'random';

  @Column({ type: 'text' })
  profileId!: string;

  @Column({ type: 'text', nullable: true })
  label!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
