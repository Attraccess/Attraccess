import { Column, Entity, Index, PrimaryGeneratedColumn } from '@attraccess/plugins-backend-sdk';

export const RESERVATION_STATUSES = [
  'pending',
  'confirmed',
  'rejected',
  'cancelled',
  'expired',
  'no_show',
  'completed',
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/** Columns holding a one-shot "already sent" timestamp; claimed atomically by the store. */
export const REMINDER_FLAGS = [
  'confirmationSentAt',
  'stillNeededSentAt',
  'reminder24hSentAt',
  'handoverSentAt',
  'overrunSentAt',
  'noShowNotifiedAt',
  'expiredNotifiedAt',
] as const;
export type ReminderFlag = (typeof REMINDER_FLAGS)[number];

// Schema owned by the migration; every column declares an explicit type because esbuild emits no
// decorator type metadata. All times are UTC.
@Entity({ name: 'reservations_reservation' })
@Index('IDX_reservations_reservation_slot', ['resourceId', 'status', 'startTime', 'endTime'])
@Index('IDX_reservations_reservation_user', ['userId', 'status'])
export class ReservationEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'integer' })
  resourceId!: number;

  @Column({ type: 'integer' })
  userId!: number;

  @Column({ type: 'datetime' })
  startTime!: Date;

  @Column({ type: 'datetime' })
  endTime!: Date;

  /** Snapshot of the resource's buffers when the booking was made. */
  @Column({ type: 'integer', default: 0 })
  bufferBeforeMinutes!: number;

  @Column({ type: 'integer', default: 0 })
  bufferAfterMinutes!: number;

  @Column({ type: 'varchar' })
  status!: ReservationStatus;

  @Column({ type: 'varchar', nullable: true })
  note!: string | null;

  @Column({ type: 'datetime' })
  createdAt!: Date;

  @Column({ type: 'datetime', nullable: true })
  endedEarlyAt!: Date | null;

  @Column({ type: 'integer', nullable: true })
  cancelledBy!: number | null;

  @Column({ type: 'varchar', nullable: true })
  cancelReason!: string | null;

  @Column({ type: 'integer', nullable: true })
  decidedBy!: number | null;

  @Column({ type: 'varchar', nullable: true })
  decisionReason!: string | null;

  @Column({ type: 'datetime', nullable: true })
  decidedAt!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  checkedInAt!: Date | null;

  @Column({ type: 'integer', nullable: true })
  checkedInUsageId!: number | null;

  /** The holder answered "still needed" / chose to keep the booking. */
  @Column({ type: 'datetime', nullable: true })
  keptAt!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  confirmationSentAt!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  stillNeededSentAt!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  reminder24hSentAt!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  handoverSentAt!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  overrunSentAt!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  noShowNotifiedAt!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  expiredNotifiedAt!: Date | null;
}
