import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { SmtpServiceType } from './smtp-settings.dto';

export class UpdateSmtpSettingsDto {
  @IsEnum(SmtpServiceType)
  @ApiProperty({
    description: 'SMTP provider type. An email provider is required.',
    enum: SmtpServiceType,
    enumName: 'SmtpServiceType',
  })
  service!: SmtpServiceType;

  @IsString()
  @MinLength(1)
  @ApiProperty({
    description: 'SMTP host.',
    example: 'smtp.example.com',
  })
  host!: string;

  @IsInt()
  @Min(1)
  @ApiProperty({
    description: 'SMTP port.',
    example: 587,
  })
  port!: number;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({
    description: 'Whether to use a secure SMTP connection.',
    example: false,
  })
  secure?: boolean | null;

  @IsString()
  @MinLength(1)
  @ApiProperty({
    description: 'SMTP username.',
    example: 'no-reply@example.com',
  })
  user!: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description: 'SMTP password.',
    example: 'secret',
  })
  pass?: string | null;

  @IsString()
  @MinLength(1)
  @ApiProperty({
    description: 'Default FROM address.',
    example: 'no-reply@example.com',
  })
  from!: string;
}
