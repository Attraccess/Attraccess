import { PREVIEW_PASSWORD_MAX } from './password-policy-limits';
// Admin password policy DTOs: full read, partial update, per-role override CRUD payloads
// FEATURE: Password policy admin contract (full surface + override CRUD)

import { PasswordPolicyRole } from '@attraccess/database-entities';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { UpdatePasswordPolicyDto } from './password-policy-settings.dto';

export class PreviewPasswordDto {
  @ApiProperty({
    description: 'Password candidate to evaluate against the policy',
    minLength: 1,
    maxLength: PREVIEW_PASSWORD_MAX,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(PREVIEW_PASSWORD_MAX)
  password!: string;

  @ApiPropertyOptional({
    enum: PasswordPolicyRole,
    enumName: 'PasswordPolicyRole',
    description: 'Evaluate against the effective policy for this role (uses global if omitted).',
  })
  @IsOptional()
  role?: PasswordPolicyRole;

  @ApiPropertyOptional({
    description: 'Draft policy overrides to merge over the persisted policy for this evaluation only.',
    type: () => UpdatePasswordPolicyDto,
  })
  @IsOptional()
  draftPolicy?: UpdatePasswordPolicyDto;
}

export class PreviewPasswordResultDto {
  @ApiProperty({
    description: 'Whether the candidate satisfies every rule of the (draft-merged) policy',
    example: false,
  })
  ok!: boolean;

  @ApiProperty({
    description: 'Structured policy errors with codes and per-rule parameters',
    type: 'array',
    items: { type: 'object' },
  })
  errors!: Array<{ code: string; params: Record<string, unknown> }>;

  @ApiProperty({
    description: 'zxcvbn evaluation summary',
    type: 'object',
    additionalProperties: false,
    properties: { score: { type: 'number' }, required: { type: 'number' } },
  })
  zxcvbn!: { score: number; required: number };
}
