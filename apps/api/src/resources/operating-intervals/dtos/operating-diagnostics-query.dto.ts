import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsPositive, Max, Min } from 'class-validator';

export class OperatingDiagnosticsPageQueryDto {
  @IsInt()
  @IsOptional()
  @IsPositive()
  @Min(1)
  @Type(() => Number)
  @ApiPropertyOptional({ description: 'The page number to retrieve', example: 1 })
  page?: number = 1;

  @IsInt()
  @IsOptional()
  @IsPositive()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  @ApiPropertyOptional({ description: 'The number of timeline intervals per page', example: 20 })
  limit?: number = 20;
}

export class OperatingDiagnosticsRangeQueryDto {
  @IsISO8601()
  @IsOptional()
  @ApiPropertyOptional({
    description: 'Start of the range (ISO 8601). Defaults to 31 days before `to`.',
    format: 'date-time',
  })
  from?: string;

  @IsISO8601()
  @IsOptional()
  @ApiPropertyOptional({ description: 'End of the range (ISO 8601). Defaults to now.', format: 'date-time' })
  to?: string;
}
