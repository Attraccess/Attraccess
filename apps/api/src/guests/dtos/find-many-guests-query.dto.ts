import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class FindManyGuestsQueryDto {
  @ApiProperty({ description: 'Page number (1-based)', required: false, type: Number })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page = 1;

  @ApiProperty({ description: 'Number of items per page', required: false, type: Number })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit = 10;

  @ApiProperty({ description: 'Search query (matches name, email or guest code)', required: false })
  @IsOptional()
  @IsString()
  search?: string;
}
