import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { User } from './user.dto';
import type { ResponseFields } from '../response-mapper';

export class Passkey {
  @ApiProperty({ description: 'The unique identifier of the passkey', example: 1 })
  id!: number;

  @ApiProperty({ description: 'The ID of the user this passkey belongs to', example: 1 })
  userId!: number;

  /** base64url encoded WebAuthn credential ID; never leaves the server */

  @Exclude()
  credentialId!: string;

  /** base64url encoded COSE public key of the credential; never leaves the server */

  @Exclude()
  publicKey!: string;

  /** signature counter last reported by the authenticator; never leaves the server */

  @Exclude()
  counter!: number;

  @ApiProperty({
    description: 'Comma separated list of transports the authenticator supports (usb, nfc, ble, internal, hybrid)',
    example: 'internal,hybrid',
    nullable: true,
  })
  transports!: string | null;

  @ApiProperty({ description: 'User provided name of the passkey', example: 'MacBook Touch ID' })
  name!: string;

  @ApiProperty({
    description: 'Whether the credential is backed up / synced by the authenticator (e.g. iCloud Keychain)',
    example: true,
  })
  backedUp!: boolean;

  @ApiProperty({ description: 'When this passkey was registered', example: '2025-01-18T12:30:00.000Z' })
  createdAt!: Date;

  @ApiProperty({
    description: 'When this passkey was last used to sign in',
    example: '2025-01-18T12:30:00.000Z',
    nullable: true,
  })
  lastUsedAt!: Date | null;

  user!: User;
  static readonly responseFields: ResponseFields = {
    id: null,
    userId: null,
    transports: null,
    name: null,
    backedUp: null,
    createdAt: null,
    lastUsedAt: null,
    user: () => User,
  };
}

/**
 * A pending WebAuthn ceremony challenge. Persisted (rather than kept in memory) so that
 * registration/authentication keeps working across API replicas and restarts.
 */

export class PasskeyChallenge {
  id!: number;

  challenge!: string;

  /** null for authentication ceremonies, which are usernameless (discoverable credentials) */ userId!: number | null;

  expiresAt!: Date;
  static readonly responseFields: ResponseFields = { id: null, challenge: null, userId: null, expiresAt: null };
}
