import { ApiProperty } from '@nestjs/swagger';
import { AppSettingsDto } from './app-settings.dto';
import { SmtpSettingsDto } from './smtp-settings.dto';

export class SystemSettingsDto {
  @ApiProperty({ description: 'Application settings', type: AppSettingsDto })
  app!: AppSettingsDto;

  @ApiProperty({ description: 'SMTP settings', type: SmtpSettingsDto })
  smtp!: SmtpSettingsDto;
}
