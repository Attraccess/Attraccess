import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsPositive, Min } from 'class-validator';
import { z } from 'zod';

export const PaginationOptionsSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(10),
});

export type PaginationOptions = z.infer<typeof PaginationOptionsSchema>;

export class PaginationOptionsDto implements PaginationOptions {
  @ApiProperty({
    description: 'The page number to retrieve',
    example: 1,
    required: false,
  })
  @IsOptional()
  @IsPositive()
  @IsInt()
  @Min(1)
  page = 1;

  @ApiProperty({
    description: 'The number of items per page',
    example: 10,
    required: false,
  })
  @IsOptional()
  @IsPositive()
  @IsInt()
  @Min(1)
  limit = 10;
}
