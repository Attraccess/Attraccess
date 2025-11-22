import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationOptionsDto } from '../../types/request';
import { IsDate, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class GetProjectUsageHistoryQueryDto extends PaginationOptionsDto {
  @ApiPropertyOptional({
    description: 'Filter history to entries starting after this date (inclusive)',
    type: String,
    format: 'date-time',
  })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  startDate?: Date;

  @ApiPropertyOptional({
    description: 'Filter history to entries starting before this date (inclusive)',
    type: String,
    format: 'date-time',
  })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  endDate?: Date;
}
