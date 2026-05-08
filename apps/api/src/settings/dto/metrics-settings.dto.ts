import { ApiProperty } from '@nestjs/swagger';
import { MetricsTogglesDto } from './metrics-toggles.dto';

export class MetricsSettingsDto {
  @ApiProperty({ description: 'Whether a metrics API key is configured' })
  apiKeyConfigured: boolean;

  @ApiProperty({ description: 'Per-subsystem metrics timing toggles', type: MetricsTogglesDto })
  toggles!: MetricsTogglesDto;

  @ApiProperty({
    description: 'Threshold above which a DB query is counted as slow (in seconds).',
  })
  slowQueryThresholdSeconds!: number;
}
