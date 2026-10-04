import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Resource } from './resource.entity';

/** A user-defined counter. Values use fixed-point billionths, with no physical unit. */
@Entity()
@Index('IDX_resource_meter_name', ['resourceId', 'name'], { unique: true })
export class ResourceMeter {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'integer' })
  resourceId!: number;

  @ManyToOne(() => Resource, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resourceId' })
  resource!: Resource;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'integer', default: 0 })
  creditsPerUnit!: number;

  @Column({ type: 'varchar', default: '0' })
  lifetimeValue!: string;

  @Column({ type: 'varchar', nullable: true })
  counterValue!: string | null;

  @Column({ type: 'datetime', nullable: true })
  latestObservedAt!: Date | null;
}
