import { ApiProperty } from '@nestjs/swagger';
import { PASSWORD_POLICY_SINGLETON_ID } from '@attraccess/application-models';
import type { ResponseFields } from '../response-mapper';

export class PasswordPolicy {
  @ApiProperty({ description: 'Singleton row identifier', example: PASSWORD_POLICY_SINGLETON_ID })
  id!: number;

  @ApiProperty({ description: 'Minimum allowed password length', example: 12 })
  minLength!: number;

  @ApiProperty({ description: 'Maximum allowed password length', example: 128 })
  maxLength!: number;

  @ApiProperty({ description: 'Whether all Unicode characters are allowed', example: true })
  allowAllUnicode!: boolean;

  @ApiProperty({ description: 'Whether at least one uppercase letter is required', example: false })
  requireUppercase!: boolean;

  @ApiProperty({ description: 'Whether at least one lowercase letter is required', example: false })
  requireLowercase!: boolean;

  @ApiProperty({ description: 'Whether at least one digit is required', example: false })
  requireDigit!: boolean;

  @ApiProperty({ description: 'Whether at least one special character is required', example: false })
  requireSpecial!: boolean;

  @ApiProperty({ description: 'Whether to check the password against the HIBP breach corpus', example: true })
  checkHIBP!: boolean;

  @ApiProperty({ description: 'Whether to reject common passwords (top-10k list)', example: true })
  checkCommonPasswords!: boolean;

  @ApiProperty({ description: 'Minimum required zxcvbn score (0-4)', example: 3 })
  minZxcvbnScore!: number;

  @ApiProperty({ description: 'How many previous passwords to remember (0 disables)', example: 0 })
  historySize!: number;

  @ApiProperty({ description: 'Forced rotation interval in days (0 disables)', example: 0 })
  rotationDays!: number;

  @ApiProperty({ description: 'When the policy record was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'When the policy record was last updated' })
  updatedAt!: Date;

  @ApiProperty({ description: 'Row version for optimistic concurrency control', example: 1 })
  version!: number;
  static readonly responseFields: ResponseFields = {
    id: null,
    minLength: null,
    maxLength: null,
    allowAllUnicode: null,
    requireUppercase: null,
    requireLowercase: null,
    requireDigit: null,
    requireSpecial: null,
    checkHIBP: null,
    checkCommonPasswords: null,
    minZxcvbnScore: null,
    historySize: null,
    rotationDays: null,
    createdAt: null,
    updatedAt: null,
    version: null,
  };
}

export { PASSWORD_POLICY_SINGLETON_ID } from '@attraccess/application-models';
