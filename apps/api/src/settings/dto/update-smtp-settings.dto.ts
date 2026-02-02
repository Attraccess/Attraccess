import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { SmtpServiceType } from './smtp-settings.dto';

export class UpdateSmtpSettingsDto {
  @IsOptional()
  @IsEnum(SmtpServiceType)
  @ApiPropertyOptional({
    description: 'SMTP provider type.',
    enum: SmtpServiceType,
    enumName: 'SmtpServiceType',
  })
  service?: SmtpServiceType | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @ApiPropertyOptional({
    description: 'SMTP host.',
    example: 'smtp.example.com',
  })
  host?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({
    description: 'SMTP port.',
    example: 587,
  })
  port?: number | null;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({
    description: 'Whether to use a secure SMTP connection.',
    example: false,
  })
  secure?: boolean | null;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description: 'SMTP username.',
    example: 'no-reply@example.com',
  })
  user?: string | null;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description: 'SMTP password.',
    example: 'secret',
  })
  pass?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @ApiPropertyOptional({
    description: 'Default FROM address.',
    example: 'no-reply@example.com',
  })
  from?: string | null;
}
