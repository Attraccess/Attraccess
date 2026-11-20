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
import { Resource } from './resource.entity';

/** The resource types and actions a plugin reader may serve, as the plugin registered them. */
export interface PluginReaderCapabilitiesColumn {
  resourceTypes: string[];
  actions: string[];
}

/**
 * A card reader a backend plugin owns, registered through `context.readers`. Host detail of plugin readers behind
 * the plugin reader store; plugins see it only as the SDK's `PluginReader`.
 * Deleted with the plugin on uninstall, kept while it is disabled.
 */
@Entity('plugin_reader')
@Index('UQ_plugin_reader_plugin_device', ['pluginId', 'deviceId'], { unique: true })
export class PluginReaderEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index('IDX_plugin_reader_plugin')
  @Column({ type: 'text' })
  pluginId!: string;

  /** Plugin-chosen id of the device, unique per plugin. */
  @Column({ type: 'text' })
  deviceId!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'jsonb' })
  capabilities!: PluginReaderCapabilitiesColumn;

  @Column({ type: 'integer', nullable: true })
  resourceId!: number | null;

  @ManyToOne(() => Resource, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'resourceId' })
  resource?: Resource | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
