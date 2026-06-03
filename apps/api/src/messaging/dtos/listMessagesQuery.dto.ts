import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive, Min } from 'class-validator';

export class ListMessagesQueryDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Min(1)
  @Type(() => Number)
  @ApiProperty({
    description: 'The page number to retrieve',
    example: 1,
    required: false,
  })
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Min(1)
  @Type(() => Number)
  @ApiProperty({
    description: 'The number of items per page',
    example: 20,
    required: false,
  })
  limit?: number = 20;
}
