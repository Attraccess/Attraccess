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

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

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
