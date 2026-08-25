import { ApiProperty } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { IsNumber, IsInt, Min, Max, IsOptional, IsString, IsArray, IsBoolean, IsIn } from 'class-validator';
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
    description: 'Only return users assigned this role',
    required: false,
    type: Number,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  roleId?: number;

  @ApiProperty({
    description: 'Role IDs to filter by',
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
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsOptional()
  roleIds?: number[];

  @ApiProperty({
    description: 'Exclude users assigned any of these role IDs',
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
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsOptional()
  excludeRoleIds?: number[];

  @ApiProperty({
    description: 'Whether users must have any or all selected roles',
    required: false,
    enum: ['any', 'all'],
  })
  @IsIn(['any', 'all'])
  @IsOptional()
  roleMatch?: 'any' | 'all';

  @ApiProperty({
    description: 'Whether users must have a verified email address',
    required: false,
    type: Boolean,
  })
  @Transform(({ obj, key }) => {
    const rawValue = obj[key];
    if (typeof rawValue === 'boolean') return rawValue;
    if (rawValue === 'true') return true;
    if (rawValue === 'false') return false;
    return rawValue;
  })
  @IsBoolean()
  @IsOptional()
  emailVerified?: boolean;

  @ApiProperty({
    description: 'SSO provider IDs to filter by',
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
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsOptional()
  ssoProviderIds?: number[];

  @ApiProperty({
    description: 'Exclude users linked to any of these SSO provider IDs',
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
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsOptional()
  excludeSsoProviderIds?: number[];

  @ApiProperty({
    description: 'Include users without an SSO provider',
    required: false,
    type: Boolean,
  })
  @Transform(({ obj, key }) => {
    const rawValue = obj[key];
    if (typeof rawValue === 'boolean') return rawValue;
    if (rawValue === 'true') return true;
    if (rawValue === 'false') return false;
    return rawValue;
  })
  @IsBoolean()
  @IsOptional()
  ssoProviderNone?: boolean;

  @ApiProperty({
    description: 'Whether users must have at least one SSO provider',
    required: false,
    type: Boolean,
  })
  @Transform(({ obj, key }) => {
    const rawValue = obj[key];
    if (typeof rawValue === 'boolean') return rawValue;
    if (rawValue === 'true') return true;
    if (rawValue === 'false') return false;
    return rawValue;
  })
  @IsBoolean()
  @IsOptional()
  hasSsoProvider?: boolean;

  @ApiProperty({
    description: 'Whether users must be linked to any or all selected SSO providers',
    required: false,
    enum: ['any', 'all'],
  })
  @IsIn(['any', 'all'])
  @IsOptional()
  ssoProviderMatch?: 'any' | 'all';

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
