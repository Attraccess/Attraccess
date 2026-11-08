import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type SecureBootKeyRole = 'signing' | 'recovery';

/**
 * Secure Boot v2 keys (RSA-3072) held by this installation. A recovery key's private part is
 * deleted once the admin proved they hold their copy; its public key and digest stay.
 */
@Entity('attractap_secure_boot_key')
@Index('IDX_attractap_secure_boot_key_digest', ['digest'], { unique: true })
export class AttractapSecureBootKey {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'text' })
  role!: SecureBootKeyRole;

  @Column({ type: 'text' })
  publicKeyPem!: string;

  /** Secure Boot v2 digest as burned into an eFuse key block, hex. */
  @Column({ type: 'text' })
  digest!: string;

  /** SHA-256 of the SPKI, hex. */
  @Column({ type: 'text' })
  fingerprint!: string;

  /** PKCS#8 PEM, AES-256-GCM encrypted by EncryptionService. Null once deleted. */
  @Column({ type: 'text', nullable: true })
  privateKeyEncrypted!: string | null;

  /** Recovery keys: when the admin proved they hold the downloaded file. */
  @Column({ type: 'datetime', nullable: true })
  verifiedAt!: Date | null;

  /** Set when the key came back from a backup or recovery file. */
  @Column({ type: 'datetime', nullable: true })
  restoredAt!: Date | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;
}
