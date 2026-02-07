import { ApiProperty } from '@nestjs/swagger';

export class AppSettingsDto {
  @ApiProperty({
    description: 'The frontend URL used for redirects and links.',
    example: 'https://frontend.example',
    nullable: true,
  })
  frontendUrl!: string | null;

  @ApiProperty({
    description: 'The backend/base URL used for callbacks and API links.',
    example: 'https://api.example',
    nullable: true,
  })
  backendUrl!: string | null;

  @ApiProperty({
    description: 'Optional public URL used for external callbacks (e.g., SumUp).',
    example: 'https://public.example',
    nullable: true,
  })
  publicInternetUrl!: string | null;

  @ApiProperty({
    description: 'Whether a license key has been configured.',
    example: true,
  })
  licenseKeyConfigured!: boolean;
}
