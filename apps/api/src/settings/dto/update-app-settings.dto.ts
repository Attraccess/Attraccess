import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MinLength } from 'class-validator';

/** Allow URLs without TLD (e.g. http://localhost:3000) for development. */
const urlOptions = { require_tld: false };

export class UpdateAppSettingsDto {
  @IsOptional()
  @IsUrl(urlOptions)
  @ApiPropertyOptional({
    description: 'Application URL used for redirects, links, and API callbacks.',
    example: 'https://attraccess.example.com',
  })
  url?: string | null;

  @IsOptional()
  @IsUrl(urlOptions)
  @ApiPropertyOptional({
    description: 'Public URL used for external callbacks.',
    example: 'https://public.example',
  })
  publicInternetUrl?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @ApiPropertyOptional({
    description: 'License key to use for license validation.',
    example: 'LICENSE_KEY',
  })
  licenseKey?: string;
}
