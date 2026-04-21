import { ApiProperty } from '@nestjs/swagger';

export class MetricsSettingsDto {
  @ApiProperty({ description: 'Whether a metrics API key is configured' })
  apiKeyConfigured: boolean;
}
