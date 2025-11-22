import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class ProjectUsageStatsQueryDto {
  @ApiPropertyOptional({
    description: 'Calculate statistics starting from this date (inclusive)',
    type: String,
    format: 'date-time',
  })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  startDate?: Date;

  @ApiPropertyOptional({
    description: 'Calculate statistics up to this date (inclusive)',
    type: String,
    format: 'date-time',
  })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  endDate?: Date;
}
