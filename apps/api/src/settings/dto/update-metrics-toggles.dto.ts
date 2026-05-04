// Partial update DTO for per-subsystem metrics toggle PATCH requests
// FEATURE: Metrics — admin-controlled timing instrumentation toggles
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateMetricsTogglesDto {
  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ description: 'Whether HTTP request timing metrics are enabled' })
  http?: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ description: 'Whether WebSocket message timing metrics are enabled' })
  ws?: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ description: 'Whether cron job timing metrics are enabled' })
  cron?: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ description: 'Whether database query timing metrics are enabled (high cardinality)' })
  db?: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ description: 'Whether external call timing metrics are enabled' })
  external?: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ description: 'Whether Server-Sent Events metrics are enabled' })
  sse?: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ description: 'Whether resource flow execution metrics are enabled' })
  flow?: boolean;
}
