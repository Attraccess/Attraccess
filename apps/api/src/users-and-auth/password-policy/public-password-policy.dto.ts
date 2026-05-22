// Swagger response shape mirroring shared PublicPasswordPolicy type for client SDK generation
// FEATURE: Password policy public endpoint API contract

import { ApiProperty } from '@nestjs/swagger';

export class PublicPasswordPolicyDto {
  @ApiProperty({ example: 12 })
  minLength!: number;

  @ApiProperty({ example: 128 })
  maxLength!: number;

  @ApiProperty({ example: true })
  allowAllUnicode!: boolean;

  @ApiProperty({ example: false })
  requireUppercase!: boolean;

  @ApiProperty({ example: false })
  requireLowercase!: boolean;

  @ApiProperty({ example: false })
  requireDigit!: boolean;

  @ApiProperty({ example: false })
  requireSpecial!: boolean;

  @ApiProperty({ example: 3, description: 'Minimum required zxcvbn score (0-4)' })
  minZxcvbnScore!: number;
}
