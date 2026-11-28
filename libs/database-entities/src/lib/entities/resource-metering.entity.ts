import { ResourceMeteringSessionStatus } from '@attraccess/application-models';
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
import { ResourceMeter } from './resource-meter.entity';
import { Resource } from './resource.entity';
import { ResourceUsage } from './resourceUsage.entity';

/** `boundary` is a reading at a session start or stop of a shared meter: it closes a time segment without resetting the meter. */
export type ResourceMeteringOperationKind = 'start' | 'interim' | 'final' | 'boundary';
export type ResourceMeteringOperationStatus = 'pending' | 'completed' | 'failed' | 'expired';

/** Logical metering session: one per usage and meter. Meter values are integer billionths stored as text. */
@Entity()
@Index('IDX_resource_metering_session_usage', ['usageId', 'meterId'], { unique: true })
@Index('IDX_resource_metering_session_resource', ['resourceId'])
@Index('IDX_resource_metering_session_meter', ['meterId'])
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

  @Column({ type: 'integer' })
  meterId!: number;

  @ManyToOne(() => ResourceMeter, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'meterId' })
  meter!: ResourceMeter;

  @Column({ type: 'varchar' })
  meterName!: string;

  /** Collection strategy captured at start, independent of later flow edits. */
  @Column({ type: 'varchar', default: 'requested' })
  collectionMode!: 'requested' | 'increment';

  /** Rate captured when the session started. */
  @Column({ type: 'bigint' })
  creditsPerUnit!: number;

  /**
   * `own`: the session accumulates its own total on the meter, because it never overlapped another session.
   * `segmented`: its consumption is the sum of its shares of the meter's shared time segments.
   * `per-session`: a measuring point of its own, read and settled independently of other sessions.
   */
  @Column({ type: 'varchar', default: 'own' })
  accounting!: 'own' | 'segmented' | 'per-session';

  /** Set when the start branch reported a lifetime-counter reading to subtract from later totals. */
  @Column({ type: 'varchar', nullable: true })
  baselineValue!: string | null;

  @Column({ type: 'varchar', nullable: true })
  source!: string | null;

  /** Highest accepted total since the reset, used to reject counter decreases. */
  @Column({ type: 'varchar', nullable: true })
  latestValue!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  latestObservedAt!: Date | null;

  @Column({ type: 'varchar', nullable: true })
  consumedValue!: string | null;

  @Column({ type: 'bigint', nullable: true })
  chargeCredits!: number | null;

  @Column({ type: 'varchar', nullable: true })
  finalOperationId!: string | null;

  @Column({ type: 'text', nullable: true })
  failureReason!: string | null;

  /** Set when the physical meter may have been reset for a different session; the total is unreliable. */
  @Column({ type: 'text', nullable: true })
  compromisedReason!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  settledAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}

/** One request/reply to the flow-defined meter; the audit trail behind a charge. */
@Entity()
@Index('IDX_resource_metering_operation_session', ['sessionId'])
@Index('IDX_resource_metering_operation_meter', ['meterId'])
export class ResourceMeteringOperation {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({ type: 'integer' })
  meterId!: number;

  @ManyToOne(() => ResourceMeter, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'meterId' })
  meter!: ResourceMeter;

  @Column({ type: 'varchar', nullable: true })
  sessionId!: string | null;

  @ManyToOne(() => ResourceMeteringSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session!: ResourceMeteringSession;

  @Column({ type: 'integer' })
  resourceId!: number;

  @Column({ type: 'varchar' })
  kind!: ResourceMeteringOperationKind;

  @Column({ type: 'varchar' })
  status!: ResourceMeteringOperationStatus;

  @Column({ type: 'timestamptz' })
  requestedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ type: 'varchar', nullable: true })
  reportedValue!: string | null;

  @Column({ type: 'varchar', nullable: true })
  readingMode!: 'total' | 'increment' | null;

  /** Total consumed since the session's reset (baseline already subtracted). */
  @Column({ type: 'varchar', nullable: true })
  totalValue!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  observedAt!: Date | null;

  @Column({ type: 'varchar', nullable: true })
  source!: string | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}

export type ResourceMeteringSegmentStatus = 'open' | 'closed' | 'abandoned';

/** A session taking part in a shared segment, with the rate it captured for the meter. Earliest started first. */
export interface ResourceMeteringSegmentParticipant {
  usageId: number;
  creditsPerUnit: number;
}

/**
 * A time span of a shared meter in which the same sessions were active. Its consumption is the difference between
 * the readings at its two boundaries and is split equally among the participants. A segment whose closing reading
 * failed stays open and absorbs the next one, so its participants are everyone who was active at any point in it.
 */
@Entity()
@Index('IDX_resource_metering_segment_meter', ['meterId', 'status'])
@Index('IDX_resource_metering_segment_meter_ended', ['meterId', 'endedAt'])
export class ResourceMeteringSegment {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({ type: 'integer' })
  resourceId!: number;

  @ManyToOne(() => Resource, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resourceId' })
  resource!: Resource;

  @Column({ type: 'integer' })
  meterId!: number;

  @ManyToOne(() => ResourceMeter, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'meterId' })
  meter!: ResourceMeter;

  @Column({ type: 'varchar' })
  status!: ResourceMeteringSegmentStatus;

  @Column({ type: 'timestamptz' })
  startedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt!: Date | null;

  /** Meter counter at the opening boundary. Fixed-point billionths as text. */
  @Column({ type: 'varchar' })
  startValue!: string;

  @Column({ type: 'varchar', nullable: true })
  endValue!: string | null;

  @Column({ type: 'jsonb' })
  participants!: ResourceMeteringSegmentParticipant[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
