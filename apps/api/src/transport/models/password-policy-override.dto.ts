// Per-role password policy override; nullable columns inherit from global singleton policy
// FEATURE: Password policy per-role overrides (admin only; machine/api-token are future slices)
import { ApiProperty } from '@nestjs/swagger';
import { PasswordPolicyRole } from '@attraccess/application-models';
import type { ResponseFields } from '../response-mapper';

export class PasswordPolicyOverride {
  @ApiProperty({
    description: 'Role this override applies to',
    enum: PasswordPolicyRole,
    enumName: 'PasswordPolicyRole',
  })
  role!: PasswordPolicyRole;

  @ApiProperty({ description: 'Override minimum password length', example: 16, nullable: true, required: false })
  minLength!: number | null;

  @ApiProperty({ description: 'Override maximum password length', example: 256, nullable: true, required: false })
  maxLength!: number | null;

  @ApiProperty({ description: 'Override allow-all-unicode flag', nullable: true, required: false })
  allowAllUnicode!: boolean | null;

  @ApiProperty({ description: 'Override require-uppercase flag', nullable: true, required: false })
  requireUppercase!: boolean | null;

  @ApiProperty({ description: 'Override require-lowercase flag', nullable: true, required: false })
  requireLowercase!: boolean | null;

  @ApiProperty({ description: 'Override require-digit flag', nullable: true, required: false })
  requireDigit!: boolean | null;

  @ApiProperty({ description: 'Override require-special flag', nullable: true, required: false })
  requireSpecial!: boolean | null;

  @ApiProperty({ description: 'Override HIBP breach check flag', nullable: true, required: false })
  checkHIBP!: boolean | null;

  @ApiProperty({ description: 'Override common-password rejection flag', nullable: true, required: false })
  checkCommonPasswords!: boolean | null;

  @ApiProperty({ description: 'Override minimum zxcvbn score (0-4)', example: 4, nullable: true, required: false })
  minZxcvbnScore!: number | null;

  @ApiProperty({ description: 'Override password history size', example: 5, nullable: true, required: false })
  historySize!: number | null;

  @ApiProperty({
    description: 'Override forced rotation interval in days',
    example: 90,
    nullable: true,
    required: false,
  })
  rotationDays!: number | null;

  @ApiProperty({ description: 'When the override row was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'When the override row was last updated' })
  updatedAt!: Date;

  @ApiProperty({ description: 'Row version for optimistic concurrency control', example: 1 })
  version!: number;
  static readonly responseFields: ResponseFields = {
    role: null,
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

export { PasswordPolicyRole, PASSWORD_POLICY_ROLES } from '@attraccess/application-models';
