import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsDate, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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
