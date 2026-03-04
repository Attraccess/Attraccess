import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUrl, MinLength } from 'class-validator';
import { COOKIE_SAME_SITE_VALUES, CookieSameSitePolicy } from '../constants';

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

  @IsOptional()
  @IsEnum(COOKIE_SAME_SITE_VALUES)
  @ApiPropertyOptional({
    description:
      'SameSite cookie policy. "lax" (default) works with SSO. "strict" breaks SSO IdP redirects. "none" requires HTTPS.',
    enum: ['lax', 'strict', 'none'],
    example: 'lax',
  })
  cookieSameSite?: CookieSameSitePolicy;
}
