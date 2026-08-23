import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsDate, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PaginatedResponseWithNextPage } from '../../../types/response';

export class ListApiTokensQueryDto {
  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1, minimum: 1, type: Number })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ description: 'Number of items per page', default: 10, minimum: 1, maximum: 100, type: Number })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit = 10;
}

export class CreateApiTokenDto {
  @ApiProperty({ example: 'CI deployment' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ type: [String], example: ['resources.read'] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissionKeys!: string[];

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date;
}

export class UpdateApiTokenDto {
  @ApiPropertyOptional({ example: 'CI deployment' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ type: [String], example: ['resources.read'] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissionKeys?: string[];

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date | null;
}

export class ApiTokenMetadataDto {
  id!: number;
  name!: string;
  permissionKeys!: string[];
  createdAt!: Date;
  lastUsedAt!: Date | null;
  expiresAt!: Date | null;
}

export class CreateApiTokenResponseDto extends ApiTokenMetadataDto {
  token!: string;
}

export class PaginatedApiTokensResponseDto extends PaginatedResponseWithNextPage<ApiTokenMetadataDto> {
  @ApiProperty({ type: [ApiTokenMetadataDto] })
  data!: ApiTokenMetadataDto[];
}
