import { Column, CreateDateColumn, Entity, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';

/** Per-resource reader UI settings (ATT-1187). `noScreenPolicy` null means "use the plugin default". */
@Entity('reader_ui_resource_settings')
export class ReaderUiResourceSettings {
  @PrimaryColumn({ type: 'integer' })
  resourceId!: number;

  @Column({ type: 'text', nullable: true })
  noScreenPolicy!: 'block' | 'card-confirm' | 'allow-with-warning' | null;
}

/** Per (resource, plugin) widget toggle and hook failure policy. */
@Entity('reader_ui_plugin_settings')
export class ReaderUiPluginSettings {
  @PrimaryColumn({ type: 'integer' })
  resourceId!: number;

  @PrimaryColumn({ type: 'text' })
  plugin!: string;

  @Column({ type: 'boolean', default: true })
  widgetsEnabled!: boolean;

  @Column({ type: 'text', default: 'fail-closed' })
  hookFailurePolicy!: 'fail-closed' | 'fail-open';
}

/** Per-reader plugin widget toggle. */
@Entity('reader_ui_reader_settings')
export class ReaderUiReaderSettings {
  @PrimaryColumn({ type: 'integer' })
  readerId!: number;

  @Column({ type: 'boolean', default: true })
  widgetsEnabled!: boolean;
}

export type ReaderUiAlertKind = 'breaker-open' | 'load-failure' | 'crash-loop';

/** Host-owned admin alert: open circuit breaker, ACCESS_HOOKS load failure or reader crash-loop suspension. */
@Entity('reader_ui_alert')
export class ReaderUiAlert {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'text' })
  kind!: ReaderUiAlertKind;

  @Column({ type: 'text', nullable: true })
  plugin!: string | null;

  @Column({ type: 'integer', nullable: true })
  readerId!: number | null;

  @Column({ type: 'text' })
  message!: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  @Column({ type: 'datetime', nullable: true })
  clearedAt!: Date | null;

  @Column({ type: 'integer', nullable: true })
  clearedByUserId!: number | null;
}
