import { Exclude } from 'class-transformer';
import { Column } from 'typeorm';

/** Persisted user security state inherited by User. */
export abstract class UserSecurityState {
  @Column({ type: 'text', nullable: true })
  @Exclude()
  emailVerificationToken!: string | null;

  @Column({ type: 'datetime', nullable: true })
  @Exclude()
  emailVerificationTokenExpiresAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  @Exclude()
  passwordResetToken!: string | null;

  @Column({ type: 'datetime', nullable: true })
  @Exclude()
  passwordResetTokenExpiresAt!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  @Exclude()
  lastUsernameChangeAt!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  @Exclude()
  lockedUntil!: Date | null;

  @Column({ type: 'integer', default: 0 })
  @Exclude()
  failedLoginAttempts!: number;

  @Column({ type: 'datetime', nullable: true })
  @Exclude()
  firstFailedLoginAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  @Exclude()
  deleteAccountToken!: string | null;

  @Column({ type: 'datetime', nullable: true })
  @Exclude()
  deleteAccountTokenExpiresAt!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  @Exclude()
  deleteAccountRequestedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  @Exclude()
  nfcKeySeedToken!: string | null;
}
