import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateMessagingRateLimitSettingsDto {
  @ApiPropertyOptional({ description: 'Max messages a user may send within the send window', example: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  sendMaxPerWindow?: number;

  @ApiPropertyOptional({ description: 'Length of the send rate-limit window, in seconds', example: 60 })
  @IsOptional()
  @IsInt()
  @Min(1)
  sendWindowSeconds?: number;

  @ApiPropertyOptional({ description: 'Max conversations a user may open within the contact window', example: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  contactMaxPerWindow?: number;

  @ApiPropertyOptional({ description: 'Length of the contact rate-limit window, in seconds', example: 60 })
  @IsOptional()
  @IsInt()
  @Min(1)
  contactWindowSeconds?: number;
}
