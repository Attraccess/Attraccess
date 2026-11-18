import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import type { PasskeyRecord } from '@attraccess/application-models';
import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

// ponytail: the WebAuthn option/response payloads are deep, browser-defined structures. They are
// passed straight through to @simplewebauthn, which does the real validation, so we type them as
// opaque objects instead of mirroring the whole spec in DTO classes.
const WEBAUTHN_JSON = { type: 'object', additionalProperties: true } as const;

export class PasskeyOptionsResponseDto {
  @ApiProperty({
    ...WEBAUTHN_JSON,
    description: 'PublicKeyCredentialCreationOptionsJSON / PublicKeyCredentialRequestOptionsJSON',
  })
  options!: Record<string, unknown>;
}

export class VerifyPasskeyRegistrationDto {
  @IsObject()
  @ApiProperty({ ...WEBAUTHN_JSON, description: 'The RegistrationResponseJSON returned by the browser' })
  response!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @ApiProperty({ description: 'A name to identify the passkey by', example: 'MacBook Touch ID', required: false })
  name?: string;
}

export class RenamePasskeyDto {
  @IsString()
  @MaxLength(64)
  @ApiProperty({ description: 'The new name of the passkey', example: 'iPhone' })
  name!: string;
}

export class PasskeySessionDto {
  @IsObject()
  @ApiProperty({ ...WEBAUTHN_JSON, description: 'The AuthenticationResponseJSON returned by the browser' })
  response!: Record<string, unknown>;

  @IsIn(['cookie', 'body'])
  @ApiProperty({ description: 'Where to return the session token', enum: ['cookie', 'body'], example: 'cookie' })
  tokenLocation!: 'cookie' | 'body';
}

/** A registered passkey as clients see it. The credential id, public key and counter never leave the server. */
@ApiSchema({ name: 'Passkey' })
export class PasskeyResponseDto {
  @ApiProperty({ description: 'The unique identifier of the passkey', example: 1 })
  id!: number;

  @ApiProperty({ description: 'The ID of the user this passkey belongs to', example: 1 })
  userId!: number;

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
}

export function toPasskeyResponse(passkey: PasskeyRecord): PasskeyResponseDto {
  return {
    id: passkey.id,
    userId: passkey.userId,
    transports: passkey.transports,
    name: passkey.name,
    backedUp: passkey.backedUp,
    createdAt: passkey.createdAt,
    lastUsedAt: passkey.lastUsedAt,
  };
}
