import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Resource } from './resource.entity';
import { ResourceUsage } from './resourceUsage.entity';

export enum ResourceMeteringSessionStatus {
  /** Metering is initialized; the usage is running (or being started). */
  Active = 'active',
  /** The final total was collected and the energy charge is part of the usage bill. */
  Settled = 'settled',
  /** The usage ended but no valid final total is available yet; retryable. */
  Pending = 'pending',
  /** The final total can no longer be obtained (or was rejected); needs an operator decision. */
  Failed = 'failed',
  /** An operator decided not to charge energy for this usage. */
  Waived = 'waived',
}

export type ResourceMeteringOperationKind = 'start' | 'interim' | 'final';
export type ResourceMeteringOperationStatus = 'pending' | 'completed' | 'failed' | 'expired';

/** Logical metering session: one per usage. Energy values are integer micro-watt-hours stored as text. */
@Entity()
@Index('IDX_resource_metering_session_usage', ['usageId'], { unique: true })
@Index('IDX_resource_metering_session_resource', ['resourceId'])
export class ResourceMeteringSession {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({ type: 'integer' })
  resourceId!: number;

  @ManyToOne(() => Resource, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resourceId' })
  resource!: Resource;

  @Column({ type: 'integer' })
  usageId!: number;

  @ManyToOne(() => ResourceUsage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usageId' })
  usage!: ResourceUsage;

  @Column({ type: 'varchar' })
  status!: ResourceMeteringSessionStatus;

  /** Rate captured when the session started. */
  @Column({ type: 'integer' })
  creditsPerKwh!: number;

  /** Set when the start branch reported a lifetime-counter reading to subtract from later totals. */
  @Column({ type: 'varchar', nullable: true })
  baselineMicroWh!: string | null;

  @Column({ type: 'varchar', nullable: true })
  source!: string | null;

  /** Highest accepted total since the reset, used to reject counter decreases. */
  @Column({ type: 'varchar', nullable: true })
  latestMicroWh!: string | null;

  @Column({ type: 'datetime', nullable: true })
  latestObservedAt!: Date | null;

  @Column({ type: 'varchar', nullable: true })
  consumedMicroWh!: string | null;

  @Column({ type: 'integer', nullable: true })
  chargeCredits!: number | null;

  @Column({ type: 'varchar', nullable: true })
  finalOperationId!: string | null;

  @Column({ type: 'text', nullable: true })
  failureReason!: string | null;

  /** Set when the physical meter may have been reset for a different session; the total is unreliable. */
  @Column({ type: 'text', nullable: true })
  compromisedReason!: string | null;

  @Column({ type: 'datetime', nullable: true })
  settledAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

/** One request/reply to the flow-defined meter; the audit trail behind a charge. */
@Entity()
@Index('IDX_resource_metering_operation_session', ['sessionId'])
export class ResourceMeteringOperation {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({ type: 'varchar' })
  sessionId!: string;

  @ManyToOne(() => ResourceMeteringSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session!: ResourceMeteringSession;

  @Column({ type: 'integer' })
  resourceId!: number;

  @Column({ type: 'varchar' })
  kind!: ResourceMeteringOperationKind;

  @Column({ type: 'varchar' })
  status!: ResourceMeteringOperationStatus;

  @Column({ type: 'datetime' })
  requestedAt!: Date;

  @Column({ type: 'datetime', nullable: true })
  completedAt!: Date | null;

  /** Total consumed since the session's reset (baseline already subtracted). */
  @Column({ type: 'varchar', nullable: true })
  totalMicroWh!: string | null;

  @Column({ type: 'datetime', nullable: true })
  observedAt!: Date | null;

  @Column({ type: 'varchar', nullable: true })
  source!: string | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
