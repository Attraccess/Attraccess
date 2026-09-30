import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class AddPluginRegistryDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  url: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  token?: string | null;
}

export class InstallPluginDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  registryId?: string;
}

export class ReplaceInstalledPluginDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  approvedPermissionAdditions?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  // Preserve the JSON value so global implicit conversion cannot turn "false" into true.
  @Transform(({ obj, key }) => obj[key])
  @IsBoolean()
  approvedMajorVersion?: boolean;
}

export class UpdateInstalledPluginPolicyDto {
  @ApiProperty()
  @IsString()
  requestedSpec: string;

  @ApiProperty({ enum: ['inherit', 'off', 'patch', 'minor', 'follow'] })
  @IsIn(['inherit', 'off', 'patch', 'minor', 'follow'])
  updateOverride: 'inherit' | 'off' | 'patch' | 'minor' | 'follow';
}
