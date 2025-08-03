import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsNumber, Min, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { ToBoolean } from '../../../common/request-transformers';

export class ListMaintenancesDto {
  @ApiProperty({
    description: 'Page number for pagination',
    example: 1,
    required: false,
    default: 1,
  })
  @IsNumber()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiProperty({
    description: 'Number of items per page',
    example: 10,
    required: false,
    default: 10,
  })
  @IsNumber()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 10;

  @ApiProperty({
    description: 'Include upcoming maintenances (start time in the future)',
    example: true,
    required: false,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  @ToBoolean()
  @Type(() => Boolean)
  includeUpcoming?: boolean = true;

  @ApiProperty({
    description: 'Include active maintenances (currently ongoing)',
    example: true,
    required: false,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  @ToBoolean()
  includeActive?: boolean = true;

  @ApiProperty({
    description: 'Include past maintenances (already finished)',
    example: false,
    required: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  @ToBoolean()
  includePast?: boolean = false;
}
