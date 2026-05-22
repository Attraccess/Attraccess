import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateAuthRateLimitSettingsDto {
  @ApiPropertyOptional({ description: 'Max failed attempts within the window before lockout', example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxAttempts?: number;

  @ApiPropertyOptional({ description: 'Sliding window length, in seconds', example: 900 })
  @IsOptional()
  @IsInt()
  @Min(1)
  windowSeconds?: number;

  @ApiPropertyOptional({ description: 'Base lockout duration in seconds', example: 900 })
  @IsOptional()
  @IsInt()
  @Min(1)
  lockoutDurationSeconds?: number;

  @ApiPropertyOptional({ description: 'Whether to extend lockout exponentially on repeat lockouts' })
  @IsOptional()
  @IsBoolean()
  exponentialBackoff?: boolean;

  @ApiPropertyOptional({ description: 'Multiplier applied to lockout duration', example: 2 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  backoffMultiplier?: number;
}
