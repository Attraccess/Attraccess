import { ApiProperty } from '@nestjs/swagger';

export class AuthRateLimitSettingsDto {
  @ApiProperty({ description: 'Max failed attempts within the window before lockout', example: 5 })
  maxAttempts!: number;

  @ApiProperty({ description: 'Sliding window length, in seconds, for counting attempts', example: 900 })
  windowSeconds!: number;

  @ApiProperty({ description: 'Base lockout duration in seconds after the threshold is reached', example: 900 })
  lockoutDurationSeconds!: number;

  @ApiProperty({ description: 'Whether to extend lockout exponentially on repeat lockouts', example: false })
  exponentialBackoff!: boolean;

  @ApiProperty({ description: 'Multiplier applied to lockout duration when exponentialBackoff is on', example: 2 })
  backoffMultiplier!: number;
}
