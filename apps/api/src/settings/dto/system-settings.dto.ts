import { ApiProperty } from '@nestjs/swagger';
import { AppSettingsDto } from './app-settings.dto';
import { SmtpSettingsDto } from './smtp-settings.dto';
import { RateLimitSettingsDto } from './rate-limit-settings.dto';

export class SystemSettingsDto {
  @ApiProperty({ description: 'Application settings', type: AppSettingsDto })
  app!: AppSettingsDto;

  @ApiProperty({ description: 'SMTP settings', type: SmtpSettingsDto })
  smtp!: SmtpSettingsDto;

  @ApiProperty({ description: 'Rate-limit settings', type: RateLimitSettingsDto })
  rateLimit!: RateLimitSettingsDto;
}
