import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class UpdateMetricsSettingsDto {
  @ApiProperty({ description: 'API key for the metrics endpoint. Set to empty string to disable.' })
  @IsString()
  apiKey: string;
}
