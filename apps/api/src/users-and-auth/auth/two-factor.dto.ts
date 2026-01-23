import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Matches } from 'class-validator';

export enum TwoFactorPolicy {
  OPTIONAL = 'optional',
  REQUIRED_FOR_PRIVILEGED = 'required_for_privileged',
  REQUIRED_FOR_ALL = 'required_for_all',
}

export class TwoFactorStatusDto {
  @ApiProperty({
    description: 'Whether TOTP is enabled for the current user',
    example: true,
  })
  enabled: boolean;

  @ApiProperty({
    description: 'Whether TOTP is required for the current user',
    example: false,
  })
  required: boolean;

  @ApiProperty({
    description: 'The configured 2FA policy',
    enum: TwoFactorPolicy,
    enumName: 'TwoFactorPolicy',
  })
  policy: TwoFactorPolicy;
}

export class TwoFactorSetupResponseDto {
  @ApiProperty({
    description: 'The shared secret for the authenticator app',
    example: 'JBSWY3DPEHPK3PXP',
  })
  secret: string;

  @ApiProperty({
    description: 'The otpauth URL for QR code generation',
    example: 'otpauth://totp/Attraccess:testuser?secret=JBSWY3DPEHPK3PXP&issuer=Attraccess',
  })
  otpauthUrl: string;
}

export class TwoFactorCodeDto {
  @ApiProperty({
    description: 'The current code from the authenticator app',
    example: '123456',
  })
  @IsString()
  @Matches(/^\s*\d(?:\s*\d){5}\s*$/, {
    message: 'Invalid two-factor code format. Use 6 digits; spaces are allowed.',
  })
  code: string;
}

export class TwoFactorPolicyDto {
  @ApiProperty({
    description: 'The 2FA policy to enforce',
    enum: TwoFactorPolicy,
    enumName: 'TwoFactorPolicy',
  })
  @IsEnum(TwoFactorPolicy)
  policy: TwoFactorPolicy;
}
