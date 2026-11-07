import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';

const MAX_PEM_LENGTH = 16 * 1024;
const MAX_PASSPHRASE_LENGTH = 1024;

export class SecureBootKeyInfoDto {
  @ApiProperty({ description: 'Secure Boot v2 digest as burned into an eFuse key block (hex)' })
  digest!: string;

  @ApiProperty({ description: 'SHA-256 of the public key (hex)' })
  fingerprint!: string;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  restoredAt!: Date | null;
}

export class RecoveryKeyInfoDto extends SecureBootKeyInfoDto {
  @ApiProperty({ nullable: true, type: String, format: 'date-time', description: 'When the recovery check passed' })
  verifiedAt!: Date | null;
}

export class SecureBootKeysStateDto {
  @ApiProperty({ enum: ['none', 'recovery-check-pending', 'ready'] })
  status!: 'none' | 'recovery-check-pending' | 'ready';

  @ApiProperty({ description: 'The signing key came back from a backup or recovery file' })
  restored!: boolean;

  @ApiPropertyOptional({ type: SecureBootKeyInfoDto, nullable: true })
  signingKey!: SecureBootKeyInfoDto | null;

  @ApiPropertyOptional({ type: RecoveryKeyInfoDto, nullable: true })
  recoveryKey!: RecoveryKeyInfoDto | null;

  @ApiProperty({ description: 'Readers with Secure Boot digests burned; blocks regenerating keys' })
  readersWithBurnedDigests!: number;

  @ApiProperty({ description: 'Whether a restore is currently allowed' })
  restoreAllowed!: boolean;
}

export class SecureBootKeyFingerprintsDto {
  @ApiProperty()
  signingFingerprint!: string;

  @ApiProperty()
  recoveryFingerprint!: string;
}

export class PassphraseDto {
  @ApiProperty({ description: 'Protects the downloaded key file; at least 12 characters, never stored' })
  @IsString()
  @MaxLength(MAX_PASSPHRASE_LENGTH)
  passphrase!: string;
}

export class KeyFileDto extends PassphraseDto {
  @ApiProperty({ description: 'The encrypted PKCS#8 PEM file contents' })
  @IsString()
  @MaxLength(MAX_PEM_LENGTH)
  pem!: string;
}

export class RestoreKeysDto extends KeyFileDto {
  @ApiProperty({ enum: ['signing-backup', 'recovery-file'] })
  @IsIn(['signing-backup', 'recovery-file'])
  source!: 'signing-backup' | 'recovery-file';
}

export class KeyFileDownloadDto {
  @ApiProperty({ description: 'Encrypted PKCS#8 PEM (openssl and espsecure can read it with the passphrase)' })
  pem!: string;

  @ApiProperty()
  fingerprint!: string;
}

export class RecoveryCheckResultDto {
  @ApiProperty()
  fingerprint!: string;
}
