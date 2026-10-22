import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Resource } from './resource.entity';
import type { FormSubmissionDraft } from '@attraccess/application-models';
import { LifecycleBillingItem } from '@attraccess/application-models';

/** A reservation, never a completed usage or bill. Interrupted attempts are aborted, not replayed. */
@Entity()
@Index('IDX_resource_usage_lifecycle_attempt_resource', ['resourceId'], { unique: true })
export class ResourceUsageLifecycleAttempt {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({ type: 'integer' })
  resourceId!: number;

  @ManyToOne(() => Resource, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resourceId' })
  resource!: Resource;

  @Column({ type: 'varchar' })
  kind!: 'start' | 'end' | 'takeover';

  @Column({ type: 'integer', nullable: true })
  candidateUsageId!: number | null;

  @Column({ type: 'integer', nullable: true })
  previousUsageId!: number | null;

  @Column({ type: 'datetime' })
  transitionTime!: Date;

  @Column({ type: 'simple-json' })
  formSubmissions!: FormSubmissionDraft[];

  @Column({ type: 'simple-json' })
  billingItems!: LifecycleBillingItem[];

  @CreateDateColumn()
  createdAt!: Date;
}

export { LifecycleBillingItem } from '@attraccess/application-models';
