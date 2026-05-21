// Admin password policy DTOs: full read, partial update, per-role override CRUD payloads
// FEATURE: Password policy admin contract (full surface + override CRUD)

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { PasswordPolicyRole } from '@attraccess/database-entities';

const MIN_LENGTH_FLOOR = 8;
const MIN_LENGTH_MAX = 1024;
const SCORE_MIN = 0;
const SCORE_MAX = 4;
const HISTORY_MAX = 50;
const ROTATION_MAX = 3650;
const PREVIEW_PASSWORD_MAX = 4096;

export const PASSWORD_POLICY_MIN_LENGTH_FLOOR = MIN_LENGTH_FLOOR;

export class PasswordPolicyDto {
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

  @ApiProperty({ example: true })
  checkHIBP!: boolean;

  @ApiProperty({ example: true })
  checkCommonPasswords!: boolean;

  @ApiProperty({ example: 3, description: 'Minimum required zxcvbn score (0-4)' })
  minZxcvbnScore!: number;

  @ApiProperty({ example: 0, description: 'Number of recent passwords to remember (0 disables)' })
  historySize!: number;

  @ApiProperty({ example: 0, description: 'Forced rotation interval in days (0 disables)' })
  rotationDays!: number;
}

export class UpdatePasswordPolicyDto {
  @ApiPropertyOptional({ example: 12, minimum: MIN_LENGTH_FLOOR, maximum: MIN_LENGTH_MAX })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_LENGTH_FLOOR)
  @Max(MIN_LENGTH_MAX)
  minLength?: number;

  @ApiPropertyOptional({ example: 128, minimum: MIN_LENGTH_FLOOR, maximum: MIN_LENGTH_MAX })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_LENGTH_FLOOR)
  @Max(MIN_LENGTH_MAX)
  maxLength?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  allowAllUnicode?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  requireUppercase?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  requireLowercase?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  requireDigit?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  requireSpecial?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  checkHIBP?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  checkCommonPasswords?: boolean;

  @ApiPropertyOptional({ example: 3, minimum: SCORE_MIN, maximum: SCORE_MAX })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(SCORE_MIN)
  @Max(SCORE_MAX)
  minZxcvbnScore?: number;

  @ApiPropertyOptional({ example: 0, minimum: 0, maximum: HISTORY_MAX })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(HISTORY_MAX)
  historySize?: number;

  @ApiPropertyOptional({ example: 0, minimum: 0, maximum: ROTATION_MAX })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(ROTATION_MAX)
  rotationDays?: number;
}

export class PasswordPolicyOverrideDto {
  @ApiProperty({ enum: PasswordPolicyRole, enumName: 'PasswordPolicyRole' })
  role!: PasswordPolicyRole;

  @ApiProperty({ nullable: true, type: Number })
  minLength!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  maxLength!: number | null;

  @ApiProperty({ nullable: true, type: Boolean })
  allowAllUnicode!: boolean | null;

  @ApiProperty({ nullable: true, type: Boolean })
  requireUppercase!: boolean | null;

  @ApiProperty({ nullable: true, type: Boolean })
  requireLowercase!: boolean | null;

  @ApiProperty({ nullable: true, type: Boolean })
  requireDigit!: boolean | null;

  @ApiProperty({ nullable: true, type: Boolean })
  requireSpecial!: boolean | null;

  @ApiProperty({ nullable: true, type: Boolean })
  checkHIBP!: boolean | null;

  @ApiProperty({ nullable: true, type: Boolean })
  checkCommonPasswords!: boolean | null;

  @ApiProperty({ nullable: true, type: Number })
  minZxcvbnScore!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  historySize!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  rotationDays!: number | null;
}

export class UpsertPasswordPolicyOverrideDto {
  @ApiPropertyOptional({ nullable: true, type: Number, minimum: MIN_LENGTH_FLOOR, maximum: MIN_LENGTH_MAX })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  @Min(MIN_LENGTH_FLOOR)
  @Max(MIN_LENGTH_MAX)
  minLength?: number | null;

  @ApiPropertyOptional({ nullable: true, type: Number, minimum: MIN_LENGTH_FLOOR, maximum: MIN_LENGTH_MAX })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  @Min(MIN_LENGTH_FLOOR)
  @Max(MIN_LENGTH_MAX)
  maxLength?: number | null;

  @ApiPropertyOptional({ nullable: true, type: Boolean })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsBoolean()
  allowAllUnicode?: boolean | null;

  @ApiPropertyOptional({ nullable: true, type: Boolean })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsBoolean()
  requireUppercase?: boolean | null;

  @ApiPropertyOptional({ nullable: true, type: Boolean })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsBoolean()
  requireLowercase?: boolean | null;

  @ApiPropertyOptional({ nullable: true, type: Boolean })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsBoolean()
  requireDigit?: boolean | null;

  @ApiPropertyOptional({ nullable: true, type: Boolean })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsBoolean()
  requireSpecial?: boolean | null;

  @ApiPropertyOptional({ nullable: true, type: Boolean })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsBoolean()
  checkHIBP?: boolean | null;

  @ApiPropertyOptional({ nullable: true, type: Boolean })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsBoolean()
  checkCommonPasswords?: boolean | null;

  @ApiPropertyOptional({ nullable: true, type: Number, minimum: SCORE_MIN, maximum: SCORE_MAX })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  @Min(SCORE_MIN)
  @Max(SCORE_MAX)
  minZxcvbnScore?: number | null;

  @ApiPropertyOptional({ nullable: true, type: Number, minimum: 0, maximum: HISTORY_MAX })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(HISTORY_MAX)
  historySize?: number | null;

  @ApiPropertyOptional({ nullable: true, type: Number, minimum: 0, maximum: ROTATION_MAX })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(ROTATION_MAX)
  rotationDays?: number | null;
}

export class PreviewPasswordDto {
  @ApiProperty({ description: 'Password candidate to evaluate against the policy', minLength: 1, maxLength: PREVIEW_PASSWORD_MAX })
  @IsString()
  @MinLength(1)
  @MaxLength(PREVIEW_PASSWORD_MAX)
  password!: string;

  @ApiPropertyOptional({ enum: PasswordPolicyRole, enumName: 'PasswordPolicyRole', description: 'Evaluate against the effective policy for this role (uses global if omitted).' })
  @IsOptional()
  role?: PasswordPolicyRole;

  @ApiPropertyOptional({ description: 'Draft policy overrides to merge over the persisted policy for this evaluation only.', type: () => UpdatePasswordPolicyDto })
  @IsOptional()
  draftPolicy?: UpdatePasswordPolicyDto;
}

export class PreviewPasswordResultDto {
  @ApiProperty({ description: 'Whether the candidate satisfies every rule of the (draft-merged) policy', example: false })
  ok!: boolean;

  @ApiProperty({ description: 'Structured policy errors with codes and per-rule parameters', type: 'array', items: { type: 'object' } })
  errors!: Array<{ code: string; params: Record<string, unknown> }>;

  @ApiProperty({ description: 'zxcvbn evaluation summary', type: 'object', additionalProperties: false, properties: { score: { type: 'number' }, required: { type: 'number' } } })
  zxcvbn!: { score: number; required: number };
}
