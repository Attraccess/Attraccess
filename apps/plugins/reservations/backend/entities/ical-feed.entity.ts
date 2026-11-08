import { Column, Entity, Index, PrimaryGeneratedColumn } from '@attraccess/plugins-backend-sdk';

@Entity({ name: 'reservations_ical_feed' })
@Index('IDX_reservations_ical_feed_user', ['userId'])
export class IcalFeedEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'integer' })
  userId!: number;

  @Column({ type: 'varchar' })
  name!: string;

  /** sha256 hex of the secret token; the token itself is never stored. */
  @Column({ type: 'varchar', unique: true })
  tokenHash!: string;

  /** First characters of the token, to recognise a feed in the UI. */
  @Column({ type: 'varchar', nullable: true })
  tokenPrefix!: string | null;

  /** JSON selection, shape defined by the iCal service. */
  @Column({ type: 'text' })
  selection!: string;

  @Column({ type: 'datetime' })
  createdAt!: Date;

  @Column({ type: 'datetime', nullable: true })
  revokedAt!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastUsedAt!: Date | null;
}
