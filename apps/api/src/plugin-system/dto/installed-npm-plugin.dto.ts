import { ApiProperty } from '@nestjs/swagger';
import { PluginDependencyInfo } from '../plugin.manifest';

export class InstalledPluginUpdateCheckDto {
  @ApiProperty()
  checkedAt: string;
  @ApiProperty({ type: String, nullable: true })
  candidate: string | null;
  @ApiProperty({ enum: ['up-to-date', 'available', 'blocked', 'failed'] })
  state: 'up-to-date' | 'available' | 'blocked' | 'failed';
  @ApiProperty({ type: String, nullable: true })
  error: string | null;
}

export class InstalledPluginCompatibilityDto {
  @ApiProperty()
  host: string;
  @ApiProperty({ type: 'object', properties: { backend: { type: 'string' }, frontend: { type: 'string' } } })
  sdk: { backend?: string; frontend?: string };
}

export class InstalledNpmPluginDto {
  @ApiProperty({ type: [PluginDependencyInfo], required: false })
  dependencies?: PluginDependencyInfo[];
  @ApiProperty()
  name: string;
  @ApiProperty()
  version: string;
  @ApiProperty()
  requestedSpec: string;
  @ApiProperty()
  registryId: string;
  @ApiProperty()
  registryUrl: string;
  @ApiProperty()
  integrity: string;
  @ApiProperty()
  installPath: string;
  @ApiProperty({ type: [String] })
  permissions: string[];
  @ApiProperty({ type: InstalledPluginCompatibilityDto })
  compatibility: InstalledPluginCompatibilityDto;
  @ApiProperty({ enum: ['active', 'quarantined'] })
  state: 'active' | 'quarantined';
  @ApiProperty()
  installedAt: string;
  @ApiProperty()
  activatedAt: string;
  @ApiProperty({ type: String, nullable: true })
  lastError: string | null;
  @ApiProperty({ enum: ['official', 'community'] })
  classification: 'official' | 'community';
  @ApiProperty()
  classificationReason: string;
  @ApiProperty({ type: String, nullable: true })
  publisher: string | null;
  @ApiProperty({ enum: ['inherit', 'off', 'patch', 'minor', 'follow'], required: false })
  updateOverride?: 'inherit' | 'off' | 'patch' | 'minor' | 'follow';
  @ApiProperty({ type: InstalledPluginUpdateCheckDto, required: false, nullable: true })
  updateCheck?: InstalledPluginUpdateCheckDto | null;
  @ApiProperty({ type: String, required: false, nullable: true })
  knownGoodVersion?: string | null;
}

export class InstalledPluginVersionDto {
  @ApiProperty({ type: [PluginDependencyInfo], required: false })
  dependencies?: PluginDependencyInfo[];
  @ApiProperty()
  version: string;
  @ApiProperty({ type: String, nullable: true })
  publishedAt: string | null;
  @ApiProperty({ enum: ['current', 'newer', 'older'] })
  direction: 'current' | 'newer' | 'older';
  @ApiProperty()
  compatible: boolean;
  @ApiProperty({ type: String, nullable: true })
  reason: string | null;
  @ApiProperty({ type: [String] })
  permissions: string[];
  @ApiProperty({ type: [String] })
  permissionAdditions: string[];
  @ApiProperty({ type: [String] })
  permissionRemovals: string[];
  @ApiProperty({ enum: ['official', 'community'] })
  classification: 'official' | 'community';
  @ApiProperty()
  classificationReason: string;
  @ApiProperty({ type: String, nullable: true })
  deprecated: string | null;
  @ApiProperty({ type: String, nullable: true })
  integrity: string | null;
  @ApiProperty({ type: String, nullable: true })
  repository: string | null;
  @ApiProperty({ type: String, nullable: true })
  homepage: string | null;
  @ApiProperty({ enum: ['major', 'minor', 'patch', 'prerelease', 'none'] })
  semverImpact: 'major' | 'minor' | 'patch' | 'prerelease' | 'none';
  @ApiProperty()
  matchesRequestedSpec: boolean;
  @ApiProperty({ type: String, nullable: true })
  publisher: string | null;
}
