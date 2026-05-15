// Update DTO for the metrics settings PATCH endpoint with optional toggle subset
// FEATURE: Metrics — admin-controlled timing instrumentation toggles
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Min, ValidateNested } from 'class-validator';
import { UpdateMetricsTogglesDto } from './update-metrics-toggles.dto';

export class UpdateMetricsSettingsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateMetricsTogglesDto)
  @ApiPropertyOptional({ description: 'Per-subsystem metrics toggles update', type: UpdateMetricsTogglesDto })
  toggles?: UpdateMetricsTogglesDto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  @ApiPropertyOptional({
    description: 'Threshold above which a DB query is counted as slow (in seconds).',
    minimum: 0,
  })
  slowQueryThresholdSeconds?: number;
}
