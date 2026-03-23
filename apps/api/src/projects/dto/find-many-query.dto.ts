import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsPositive, IsInt, IsNumber, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ToBoolean } from '../../common/request-transformers';

export class FindManyProjectsQueryDto {
  @ApiProperty({
    description: 'The page number to retrieve',
    example: 1,
    required: false,
    type: Number,
  })
  @IsOptional()
  @IsPositive()
  @IsInt()
  @IsNumber()
  @Min(1)
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  page = 1;

  @ApiProperty({
    description: 'The number of items per page to retrieve',
    example: 10,
    required: false,
    type: Number,
  })
  @IsOptional()
  @IsPositive()
  @IsInt()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  limit = 10;

  @ApiProperty({
    description: 'Include archived projects (already finished)',
    example: false,
    required: false,
    type: Boolean,
    default: false,
  })
  @IsOptional()
  @ToBoolean()
  @Type(() => Boolean)
  includeArchived?: boolean = false;
}
