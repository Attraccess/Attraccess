import { PluginPermission } from '@attraccess/plugins-backend-sdk';
import { ApiProperty } from '@nestjs/swagger';
import { PluginDependency } from './plugin-dependencies';
import { PluginMain } from './plugin-entrypoints';

export class PluginAttraccessVersion {
  @ApiProperty({
    description: 'The minimum version of the plugin',
    example: '1.0.0',
  })
  min?: string;

  @ApiProperty({
    description: 'The maximum version of the plugin',
    example: '1.0.0',
  })
  max?: string;

  @ApiProperty({
    description: 'The exact version of the plugin',
    example: '1.0.0',
  })
  exact?: string;
}

export class PluginDependencyInfo {
  @ApiProperty()
  name: string;
  @ApiProperty()
  version: string;
  @ApiProperty()
  required: boolean;
}

export class PluginManifest {
  @ApiProperty({ type: [PluginDependencyInfo], required: false })
  dependencies?: PluginDependency[];

  @ApiProperty({
    description: 'The name of the plugin',
    example: 'plugin-name',
  })
  name: string;

  @ApiProperty({
    type: PluginMain,
  })
  main: PluginMain;

  @ApiProperty({
    description: 'The version of the plugin',
    example: '1.0.0',
  })
  version: string;

  @ApiProperty({
    type: PluginAttraccessVersion,
  })
  attraccessVersion: PluginAttraccessVersion;

  @ApiProperty({
    description: 'Host capabilities this plugin is permitted to use at runtime',
    enum: PluginPermission,
    isArray: true,
    example: [PluginPermission.EMIT_EVENTS, PluginPermission.READ_SETTINGS],
  })
  permissions: PluginPermission[];
}

export class LoadedPluginManifest extends PluginManifest {
  @ApiProperty({
    description: 'The directory of the plugin',
    example: 'plugin-name',
  })
  pluginDirectory: string;

  @ApiProperty({
    description: 'The id of the plugin',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description:
      'Backend load status: "loaded" if the plugin backend was imported successfully, "error" if it failed to load, "unknown" if it has no backend or plugins are disabled.',
    enum: ['loaded', 'error', 'unknown'],
    example: 'loaded',
  })
  status: 'loaded' | 'error' | 'unknown';

  @ApiProperty({
    description: 'The error message if the plugin backend failed to load, otherwise null.',
    nullable: true,
    type: String,
    example: "Cannot find module '@nestjs/common'",
  })
  error: string | null;
}
