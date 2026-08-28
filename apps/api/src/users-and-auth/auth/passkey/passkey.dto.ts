import { ApiProperty } from '@nestjs/swagger';
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
