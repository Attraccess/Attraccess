import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';
import { UpdateAppSettingsDto } from './update-app-settings.dto';
import { UpdateSmtpSettingsDto } from './update-smtp-settings.dto';
import { UpdateAiSettingsDto } from './update-ai-settings.dto';

export class UpdateSystemSettingsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateAppSettingsDto)
  @ApiPropertyOptional({ description: 'Application settings update', type: UpdateAppSettingsDto })
  app?: UpdateAppSettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateSmtpSettingsDto)
  @ApiPropertyOptional({ description: 'SMTP settings update', type: UpdateSmtpSettingsDto })
  smtp?: UpdateSmtpSettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateAiSettingsDto)
  @ApiPropertyOptional({ description: 'AI / Ollama settings update', type: UpdateAiSettingsDto })
  ai?: UpdateAiSettingsDto;
}
