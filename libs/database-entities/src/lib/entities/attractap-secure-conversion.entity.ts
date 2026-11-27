import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type {
  AttractapConversionFailure,
  AttractapConversionState,
  AttractapConversionTarget,
  AttractapPreflightCheckResult,
} from '@attraccess/application-models';

/**
 * One "Secure this reader" conversion (ATT-1208). Rows are kept as history; `active` is true until the conversion
 * ends (secured, failed, cancelled), and a partial unique index allows one active row per installation. No foreign
 * key to the reader: a deleted reader's conversion stays as history and is ended by the service.
 */
@Entity('attractap_secure_conversion')
@Index('IDX_attractap_secure_conversion_one_active', ['active'], { unique: true, where: '"active"' })
@Index('IDX_attractap_secure_conversion_reader', ['readerId'])
export class AttractapSecureConversion {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'integer' })
  readerId!: number;

  @Column({ type: 'text' })
  state!: AttractapConversionState;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'text', nullable: true })
  failedInState!: AttractapConversionState | null;

  @Column({ type: 'text', nullable: true })
  failureReason!: AttractapConversionFailure | null;

  /** Firmware name, variant, version, secureVersion and the signed images' sizes and SHA-256. */
  @Column({ type: 'jsonb' })
  target!: AttractapConversionTarget;

  /** Secure Boot digest of the signing key (KEY0), hex. */
  @Column({ type: 'text' })
  digest0!: string;

  /** Secure Boot digest of the recovery key (KEY1), hex. */
  @Column({ type: 'text' })
  digest1!: string;

  @Column({ type: 'jsonb', nullable: true })
  preflight!: AttractapPreflightCheckResult[] | null;

  @Column({ type: 'boolean', default: false })
  verified!: boolean;

  @Column({ type: 'integer', default: 0 })
  bytesDone!: number;

  @Column({ type: 'integer', default: 0 })
  bytesTotal!: number;

  /** The reader's eFuse read-back after the burn: MAC and both digests. */
  @Column({ type: 'jsonb', nullable: true })
  burnReport!: { mac: string; digest0: string; digest1: string } | null;

  @Column({ type: 'integer', nullable: true })
  actorId!: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  startedAt!: Date;

  @Column({ type: 'timestamptz' })
  stateChangedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt!: Date | null;
}
