// Update DTO for the metrics settings PATCH endpoint with optional toggle subset
// FEATURE: Metrics — admin-controlled timing instrumentation toggles
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';
import { UpdateMetricsTogglesDto } from './update-metrics-toggles.dto';

export class UpdateMetricsSettingsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateMetricsTogglesDto)
  @ApiPropertyOptional({ description: 'Per-subsystem metrics toggles update', type: UpdateMetricsTogglesDto })
  toggles?: UpdateMetricsTogglesDto;
}
