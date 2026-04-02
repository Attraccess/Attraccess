import { ApiProperty } from '@nestjs/swagger';

export class GenerateMetricsApiKeyResponseDto {
  @ApiProperty({ description: 'Whether a metrics API key is configured' })
  apiKeyConfigured: boolean;

  @ApiProperty({ description: 'The generated API key (shown only once)' })
  apiKey: string;
}
