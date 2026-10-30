import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Append-only credential history. Deliberately has no relation to the reader table so that
 * deleting a reader never cascades into its history.
 */
@Entity('attractap_credential_event')
@Index('IDX_attractap_credential_event_reader_created', ['readerId', 'createdAt'])
export class AttractapCredentialEvent {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'The event ID' })
  id!: number;

  @Column({ type: 'integer' })
  @ApiProperty({ description: 'The reader ID (kept after the reader is deleted)' })
  readerId!: number;

  @Column({ type: 'text' })
  @ApiProperty({ description: 'Reader name at the time of the event' })
  readerName!: string;

  @Column({ type: 'text' })
  @ApiProperty({ description: 'SHA-256 fingerprint of the reader public key' })
  keyFingerprint!: string;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({ description: 'Serial number of the issued reader certificate', nullable: true })
  certificateSerial!: string | null;

  @Column({ type: 'text' })
  @ApiProperty({ enum: ['paired', 'revoked', 'replaced'] })
  state!: 'paired' | 'revoked' | 'replaced';

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({ description: 'The user responsible for the event', nullable: true })
  actorId!: number | null;

  @CreateDateColumn({ type: 'datetime' })
  @ApiProperty()
  createdAt!: Date;
}
