import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddPluginRegistryDto {
  @ApiProperty() name: string;
  @ApiProperty() url: string;
  @ApiPropertyOptional({ nullable: true }) token?: string | null;
}

export class InstallPluginDto {
  @ApiPropertyOptional() registryId?: string;
}

export class ReplaceInstalledPluginDto {
  @ApiPropertyOptional({ type: [String] }) approvedPermissionAdditions?: string[];
  @ApiPropertyOptional() approvedMajorVersion?: boolean;
}

export class UpdateInstalledPluginPolicyDto {
  @ApiProperty() requestedSpec: string;
  @ApiProperty({ enum: ['inherit', 'off', 'patch', 'minor', 'follow'] })
  updateOverride: 'inherit' | 'off' | 'patch' | 'minor' | 'follow';
}
