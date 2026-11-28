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

export class DependencyConfirmationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  planToken?: string;
}

export class RemoveInstalledPluginDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  approvedDependants?: string[];
}

export class InstallPluginDto extends DependencyConfirmationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  registryId?: string;

  @ApiPropertyOptional({
    description:
      'The version was offered by the host, not chosen by the admin (marketplace install). A `next` host then records `next` as requested spec, so the plugin keeps following that channel; a `latest` host records the version.',
  })
  @IsOptional()
  // Preserve the JSON value so global implicit conversion cannot turn "false" into true.
  @Transform(({ obj, key }) => obj[key])
  @IsBoolean()
  followHostChannel?: boolean;
}

export class ReplaceInstalledPluginDto extends DependencyConfirmationDto {
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
