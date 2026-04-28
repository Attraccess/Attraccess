import { ApiProperty } from '@nestjs/swagger';

export class RateLimitSettingsDto {
  @ApiProperty({ example: 60 })
  ipLoginWindowSeconds!: number;

  @ApiProperty({ example: 10 })
  ipLoginMaxRequests!: number;

  @ApiProperty({ example: 900 })
  ipEmailTriggerWindowSeconds!: number;

  @ApiProperty({ example: 5 })
  ipEmailTriggerMaxRequests!: number;

  @ApiProperty({ example: 900 })
  ipTokenActionWindowSeconds!: number;

  @ApiProperty({ example: 20 })
  ipTokenActionMaxRequests!: number;

  @ApiProperty({ example: 60 })
  accountVerifyResendCooldownSeconds!: number;

  @ApiProperty({ example: 60 })
  accountPasswordResetCooldownSeconds!: number;

  @ApiProperty({ example: 10 })
  accountLoginMaxFailures!: number;

  @ApiProperty({ example: 900 })
  accountLoginLockSeconds!: number;
}
