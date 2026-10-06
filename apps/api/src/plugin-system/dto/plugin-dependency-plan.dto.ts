import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PluginDependencyInfo } from '../plugin.manifest';

export class ResolvedPluginDependencyDto {
  @ApiProperty()
  name: string;
  @ApiProperty()
  displayName: string;
  @ApiProperty()
  version: string;
  @ApiProperty({ enum: ['install', 'reuse', 'replace'] })
  action: 'install' | 'reuse' | 'replace';
  @ApiProperty({ type: [String] })
  permissions: string[];
  @ApiProperty({ type: [PluginDependencyInfo] })
  dependencies: PluginDependencyInfo[];
  @ApiProperty({ type: String, nullable: true })
  integrity: string | null;
  @ApiProperty({ enum: ['official', 'community'] })
  classification: 'official' | 'community';
  @ApiPropertyOptional()
  registryUrl?: string;
}

export class PluginDependencyPlanDto {
  @ApiProperty()
  root: string;
  @ApiProperty()
  token: string;
  @ApiProperty({ type: [ResolvedPluginDependencyDto] })
  plugins: ResolvedPluginDependencyDto[];
}

export class PluginRemovalItemDto {
  @ApiProperty()
  name: string;
  @ApiProperty()
  version: string;
}
