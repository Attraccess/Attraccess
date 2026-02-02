import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MinLength } from 'class-validator';

export class UpdateAppSettingsDto {
  @IsOptional()
  @IsUrl()
  @ApiPropertyOptional({
    description: 'Frontend URL used for redirects and links.',
    example: 'https://frontend.example',
  })
  frontendUrl?: string | null;

  @IsOptional()
  @IsUrl()
  @ApiPropertyOptional({
    description: 'Backend/base URL used for callbacks and API links.',
    example: 'https://api.example',
  })
  backendUrl?: string | null;

  @IsOptional()
  @IsUrl()
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
