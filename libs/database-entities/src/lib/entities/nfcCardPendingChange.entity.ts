import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A card key change the server started but has not seen confirmed yet. Written before the first
 * command that changes a key reaches the card, so a tap after an interruption (card pulled, reader
 * offline, API restart) can finish the work: authenticate with the recorded key (enroll) or with the
 * factory key (reset). The key is stored encrypted like NFCCard.key.
 */
@Entity()
export class NFCCardPendingChange {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index('IDX_nfc_card_pending_change_uid')
  @Column({ type: 'text', nullable: false })
  uid!: string;

  @Column({ type: 'varchar', length: 16, nullable: false })
  kind!: 'enroll' | 'reset';

  /** Enroll: the user the card is being enrolled for. */
  @Column({ type: 'integer', nullable: true })
  userId!: number | null;

  /** Reset: the card record that is being wiped. */
  @Column({ type: 'integer', nullable: true })
  cardId!: number | null;

  @Column({ type: 'integer', nullable: false })
  keyNo!: number;

  /** Enroll: the new key being written (encrypted). Reset: empty. */
  @Column({ type: 'text', nullable: true })
  key!: string | null;

  @Column({ type: 'integer', nullable: true })
  actorId!: number | null;

  @CreateDateColumn()
  createdAt!: Date;
}
