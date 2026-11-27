import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, UpdateDateColumn } from 'typeorm';
import { PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity';

@Entity()
export class NFCCard {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'The ID of the NFC card' })
  id!: number;

  /**
   * Unique without letter case: the index `UQ_nfc_card_uid_lower` on `lower(uid)` (PostgreSQL migration
   * NfcCardUniqueUid1796500000000). Not declared here, as TypeORM cannot express an index on an expression; the
   * stored letter case is kept.
   */
  @Column({
    type: 'text',
    nullable: false,
  })
  @ApiProperty({ description: 'The UID of the NFC card' })
  uid!: string;

  @ManyToOne(() => User, (user) => user.nfcCards)
  @JoinColumn({ name: 'userId' })
  @ApiProperty({ description: 'The ID of the user that owns the NFC card', type: () => User })
  user!: User;

  /** `aes`: the card proves a key the server holds. `uid-only`: accepted on its UID alone (insecure; no key). */
  @Column({
    type: 'text',
    nullable: false,
    default: 'aes',
  })
  @ApiProperty({
    description: 'How the card is checked: with an AES key, or on its UID alone',
    enum: ['aes', 'uid-only'],
  })
  type!: 'aes' | 'uid-only';

  /** Null for a UID-only card. */
  @Column({
    type: 'integer',
    nullable: true,
  })
  @Exclude()
  keyNo!: number | null;

  /** Null for a UID-only card. */
  @Column({
    type: 'text',
    nullable: true,
  })
  @Exclude()
  key!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  @ApiProperty({ description: 'The date and time the NFC card was created' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  @ApiProperty({ description: 'The date and time the NFC card was last updated' })
  updatedAt!: Date;

  @Column({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  @ApiProperty({ description: 'The date and time the NFC card was last seen', type: 'string', format: 'date-time' })
  lastSeen!: Date;

  @Column({
    type: 'boolean',
    default: false,
  })
  @ApiProperty({ description: 'Whether the NFC card is active' })
  isActive!: boolean;
}
