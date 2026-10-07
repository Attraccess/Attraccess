import {
  MIN_LENGTH_FLOOR,
  MIN_LENGTH_MAX,
  SCORE_MIN,
  SCORE_MAX,
  HISTORY_MAX,
  ROTATION_MAX,
} from './password-policy-limits';
// Admin password policy DTOs: full read, partial update, per-role override CRUD payloads
// FEATURE: Password policy admin contract (full surface + override CRUD)

import { PasswordPolicyRole } from '@attraccess/database-entities';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';

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
