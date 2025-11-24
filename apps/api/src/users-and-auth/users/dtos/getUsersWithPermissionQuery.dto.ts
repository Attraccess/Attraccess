import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, Min, Max, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export enum PermissionFilter {
  canManageResources = 'canManageResources',
  canManageSystemConfiguration = 'canManageSystemConfiguration',
  canManageUsers = 'canManageUsers',
}

export class GetUsersWithPermissionQueryDto {
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
    description: 'Filter users by permission',
    enum: PermissionFilter,
    required: false,
    enumName: 'PermissionFilter',
  })
  @IsEnum(PermissionFilter)
  @IsOptional()
  permission?: PermissionFilter;
}
