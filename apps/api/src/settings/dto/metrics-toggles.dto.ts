// Per-subsystem metrics toggles surfaced through the settings API
// FEATURE: Metrics — admin-controlled timing instrumentation toggles
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class MetricsTogglesDto {
  @ApiProperty({ description: 'Whether HTTP request timing metrics are enabled' })
  @IsBoolean()
  http!: boolean;

  @ApiProperty({ description: 'Whether WebSocket message timing metrics are enabled' })
  @IsBoolean()
  ws!: boolean;

  @ApiProperty({ description: 'Whether cron job timing metrics are enabled' })
  @IsBoolean()
  cron!: boolean;

  @ApiProperty({ description: 'Whether database query timing metrics are enabled (high cardinality)' })
  @IsBoolean()
  db!: boolean;

  @ApiProperty({ description: 'Whether external call timing metrics are enabled' })
  @IsBoolean()
  external!: boolean;

  @ApiProperty({ description: 'Whether Server-Sent Events metrics are enabled' })
  @IsBoolean()
  sse!: boolean;

  @ApiProperty({ description: 'Whether resource flow execution metrics are enabled' })
  @IsBoolean()
  flow!: boolean;
}
