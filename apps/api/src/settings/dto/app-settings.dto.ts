import { ApiProperty } from '@nestjs/swagger';

export class AppSettingsDto {
  @ApiProperty({
    description: 'The application URL used for redirects, links, and API callbacks.',
    example: 'https://attraccess.example.com',
    nullable: true,
  })
  url!: string | null;

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
