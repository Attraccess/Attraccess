import { ApiProperty } from '@nestjs/swagger';

export class MessagingRateLimitSettingsDto {
  @ApiProperty({ description: 'Max messages a user may send within the send window', example: 30 })
  sendMaxPerWindow!: number;

  @ApiProperty({ description: 'Length of the send rate-limit window, in seconds', example: 60 })
  sendWindowSeconds!: number;

  @ApiProperty({ description: 'Max conversations a user may open within the contact window', example: 10 })
  contactMaxPerWindow!: number;

  @ApiProperty({ description: 'Length of the contact rate-limit window, in seconds', example: 60 })
  contactWindowSeconds!: number;
}
