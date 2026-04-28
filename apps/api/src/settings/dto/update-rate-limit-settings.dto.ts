import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

const MAX_SECONDS = 86_400;
const MAX_COUNT = 10_000;

export class UpdateRateLimitSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_SECONDS)
  @ApiPropertyOptional()
  ipLoginWindowSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_COUNT)
  @ApiPropertyOptional()
  ipLoginMaxRequests?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_SECONDS)
  @ApiPropertyOptional()
  ipEmailTriggerWindowSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_COUNT)
  @ApiPropertyOptional()
  ipEmailTriggerMaxRequests?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_SECONDS)
  @ApiPropertyOptional()
  ipTokenActionWindowSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_COUNT)
  @ApiPropertyOptional()
  ipTokenActionMaxRequests?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_SECONDS)
  @ApiPropertyOptional()
  accountVerifyResendCooldownSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_SECONDS)
  @ApiPropertyOptional()
  accountPasswordResetCooldownSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_COUNT)
  @ApiPropertyOptional()
  accountLoginMaxFailures?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_SECONDS)
  @ApiPropertyOptional()
  accountLoginLockSeconds?: number;
}
