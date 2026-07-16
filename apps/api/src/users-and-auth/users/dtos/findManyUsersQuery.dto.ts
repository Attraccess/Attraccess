import { ApiProperty } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { IsNumber, Min, Max, IsOptional, IsString, IsArray, IsBoolean } from 'class-validator';
import { ToBoolean } from '../../../common/request-transformers';

export class FindManyUsersQueryDto {
  @ApiProperty({
    description: 'Page number (1-based)',
    required: false,
    type: Number,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page = 1;

  @ApiProperty({
    description: 'Number of items per page',
    required: false,
    type: Number,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit = 10;

  @ApiProperty({
    description: 'Search query',
    required: false,
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiProperty({
    description: 'User IDs',
    required: false,
    type: [Number],
  })
  @Transform(({ value }) => {
    if (Array.isArray(value)) {
      return value.map((v) => parseInt(v, 10));
    }
    return value ? [parseInt(value, 10)] : undefined;
  })
  @IsArray()
  @IsOptional()
  ids?: number[];

  @ApiProperty({
    description: 'Include role assignments in the response. Requires users.read permission.',
    required: false,
    type: Boolean,
  })
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  includeRoles?: boolean;
}
