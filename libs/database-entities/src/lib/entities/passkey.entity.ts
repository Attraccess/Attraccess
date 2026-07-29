import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, CreateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { User } from './user.entity';

@Entity()
@Index(['userId'])
export class Passkey {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'The unique identifier of the passkey', example: 1 })
  id!: number;

  @Column({ type: 'integer' })
  @ApiProperty({ description: 'The ID of the user this passkey belongs to', example: 1 })
  userId!: number;

  /** base64url encoded WebAuthn credential ID; never leaves the server */
  @Column({ type: 'text', unique: true })
  @Exclude()
  credentialId!: string;

  /** base64url encoded COSE public key of the credential; never leaves the server */
  @Column({ type: 'text' })
  @Exclude()
  publicKey!: string;

  /** signature counter last reported by the authenticator; never leaves the server */
  @Column({ type: 'integer', default: 0 })
  @Exclude()
  counter!: number;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'Comma separated list of transports the authenticator supports (usb, nfc, ble, internal, hybrid)',
    example: 'internal,hybrid',
    nullable: true,
  })
  transports!: string | null;

  @Column({ type: 'text' })
  @ApiProperty({ description: 'User provided name of the passkey', example: 'MacBook Touch ID' })
  name!: string;

  @Column({ type: 'boolean', default: false })
  @ApiProperty({
    description: 'Whether the credential is backed up / synced by the authenticator (e.g. iCloud Keychain)',
    example: true,
  })
  backedUp!: boolean;

  @CreateDateColumn()
  @ApiProperty({ description: 'When this passkey was registered', example: '2025-01-18T12:30:00.000Z' })
  createdAt!: Date;

  @Column({ type: 'datetime', nullable: true })
  @ApiProperty({
    description: 'When this passkey was last used to sign in',
    example: '2025-01-18T12:30:00.000Z',
    nullable: true,
  })
  lastUsedAt!: Date | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;
}

/**
 * A pending WebAuthn ceremony challenge. Persisted (rather than kept in memory) so that
 * registration/authentication keeps working across API replicas and restarts.
 */
@Entity()
@Index(['expiresAt'])
export class PasskeyChallenge {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'text', unique: true })
  challenge!: string;

  /** null for authentication ceremonies, which are usernameless (discoverable credentials) */
  @Column({ type: 'integer', nullable: true })
  userId!: number | null;

  @Column({ type: 'datetime' })
  expiresAt!: Date;
}
