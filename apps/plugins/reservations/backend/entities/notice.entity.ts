import { Column, Entity, Index, PrimaryGeneratedColumn } from '@attraccess/plugins-backend-sdk';

/**
 * Exactly-once ledger for maintenance/health notices: inserting the (reservationId, kind, refKey)
 * row is the claim; a unique-violation means the notice was already sent.
 */
@Entity({ name: 'reservations_notice' })
@Index('UQ_reservations_notice', ['reservationId', 'kind', 'refKey'], { unique: true })
export class NoticeEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'integer' })
  reservationId!: number;

  /** e.g. `maintenance`, `health_unhealthy`, `health_recovered`. */
  @Column({ type: 'varchar' })
  kind!: string;

  /** Disambiguator inside the kind, e.g. the maintenance id or health identifier; '' when unused. */
  @Column({ type: 'varchar', default: '' })
  refKey!: string;

  @Column({ type: 'datetime' })
  sentAt!: Date;
}
