import { ApiProperty } from '@nestjs/swagger';
import { PluginDependencyInfo } from '../plugin.manifest';
import { PluginRegistrySummaryDto } from './plugin-registry.dto';

export class PluginSdkCompatibilityDto {
  @ApiProperty({ type: String, nullable: true })
  backend: string | null;
  @ApiProperty({ type: String, nullable: true })
  frontend: string | null;
}

export class MarketplacePluginDto {
  @ApiProperty({ type: [PluginDependencyInfo], required: false })
  dependencies?: PluginDependencyInfo[];
  @ApiProperty()
  name: string;
  @ApiProperty({ type: String, nullable: true })
  version: string | null;
  @ApiProperty({ type: String, nullable: true })
  displayName: string | null;
  @ApiProperty({ type: String, nullable: true })
  description: string | null;
  @ApiProperty({ type: [String] })
  permissions: string[];
  @ApiProperty({ type: String, nullable: true })
  hostRange: string | null;
  @ApiProperty({ type: PluginSdkCompatibilityDto })
  sdkCompatibility: PluginSdkCompatibilityDto;
  @ApiProperty({ type: String, nullable: true })
  repository: string | null;
  @ApiProperty({ type: String, nullable: true })
  homepage: string | null;
  @ApiProperty({ type: String, nullable: true })
  license: string | null;
  @ApiProperty({ type: String, nullable: true })
  publisher: string | null;
  @ApiProperty()
  deprecated: boolean;
  @ApiProperty({ type: PluginRegistrySummaryDto })
  registry: PluginRegistrySummaryDto;
  @ApiProperty({ enum: ['official', 'community'] })
  classification: 'official' | 'community';
  @ApiProperty()
  classificationReason: string;
  @ApiProperty()
  installable: boolean;
  @ApiProperty({ type: String, nullable: true })
  incompatibilityReason: string | null;
  @ApiProperty({ type: String, nullable: true })
  integrity: string | null;
  @ApiProperty({ type: String, nullable: true })
  provenance: string | null;
}

export class MarketplaceSearchResponseDto {
  @ApiProperty({ type: [MarketplacePluginDto] })
  results: MarketplacePluginDto[];
  @ApiProperty({ type: [String] })
  errors: string[];
}
