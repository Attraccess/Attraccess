import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Attractap } from './attractap.entity';

/** Public credentials only. Private DS material never belongs in the API database. */
@Entity()
@Unique('UQ_reader_identity_generation', ['readerId', 'generation'])
@Check('CK_reader_identity_generation', 'generation > 0')
@Check('CK_reader_identity_validity', 'validUntil > validFrom')
@Check('CK_reader_identity_class', "enrollmentClass IN ('development', 'production')")
export class AttractapReaderIdentity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'integer' })
  readerId!: number;

  @ManyToOne(() => Attractap, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'readerId' })
  reader!: Attractap;

  @Index('UQ_reader_identity_certificate', { unique: true })
  @Column({ type: 'text' })
  certificateFingerprint!: string;

  @Index('IDX_reader_identity_public_key')
  @Column({ type: 'text' })
  publicKeyFingerprint!: string;

  @Column({ type: 'text' })
  certificatePem!: string;

  @Column({ type: 'text' })
  installationId!: string;

  @Column({ type: 'integer' })
  generation!: number;

  @Column({ type: 'datetime' })
  validFrom!: Date;

  @Column({ type: 'datetime' })
  validUntil!: Date;

  @Column({ type: 'datetime', nullable: true })
  revokedAt!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  retiredAt!: Date | null;

  @Column({ type: 'text' })
  enrollmentClass!: 'development' | 'production';

  @Column({ type: 'text' })
  manifestDigest!: string;
}
