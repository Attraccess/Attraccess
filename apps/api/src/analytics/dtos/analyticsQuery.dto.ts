import { ApiProperty } from '@nestjs/swagger';
import { IsDate, IsInt, IsNotEmpty, IsOptional, IsPositive, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class AnalyticsQueryDto {
  @IsDate()
  @IsNotEmpty()
  @ApiProperty({ type: Date, description: 'The start date of the range', example: '2021-01-01' })
  start: Date;

  @IsDate()
  @IsNotEmpty()
  @ApiProperty({ type: Date, description: 'The end date of the range', example: '2021-01-01' })
  end: Date;

  @ApiProperty({ description: 'Page number (1-based)', example: 1, required: false, type: Number })
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Min(1)
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  page = 1;

  @ApiProperty({ description: 'Items per page', example: 500, required: false, type: Number })
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Min(1)
  @Max(1000)
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  limit = 500;
}
