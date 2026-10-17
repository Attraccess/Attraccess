import { PluginPermission } from '@attraccess/plugins-backend-sdk';
import { ApiProperty } from '@nestjs/swagger';
import { PluginDependency } from './dependencies';

export class PluginMainFrontend {
  @ApiProperty({
    description: 'The directory of the plugins frontend files',
    example: 'frontend',
  })
  directory: string;

  @ApiProperty({
    description: 'The entry point of the plugin, relative to the frontend directory',
    example: 'index.mjs',
  })
  entryPoint: string;

  @ApiProperty({
    description:
      "The plugin's stylesheet, relative to the frontend directory. When present, the host injects it as a <link> when the plugin loads. Plugins must bundle every CSS class they use (e.g. a Tailwind build over their own sources) — host utility classes are not a stable contract.",
    example: 'style.css',
    required: false,
  })
  styles?: string;
}

export class PluginMainBackend {
  @ApiProperty({
    description: 'The directory of the plugins backend files',
    example: 'backend',
  })
  directory: string;

  @ApiProperty({
    description: 'The entry point of the plugin, relative to the backend directory',
    example: 'index.mjs',
  })
  entryPoint: string;
}

export class PluginMainMigrations {
  @ApiProperty({
    description: "The directory holding the plugin's bundled database migrations",
    example: 'dist',
  })
  directory: string;

  @ApiProperty({
    description:
      'The entry point exporting the migration classes, relative to the migrations directory. The module exports TypeORM migration classes (named exports or a default-exported array).',
    example: 'migrations.js',
  })
  entryPoint: string;
}

export class PluginMain {
  @ApiProperty({
    description: 'The frontend files of the plugin',
    example: {
      directory: 'frontend',
      entryPoint: 'index.mjs',
    },
  })
  frontend?: PluginMainFrontend;

  @ApiProperty({
    description: 'The backend file of the plugin',
    example: {
      directory: 'backend',
      entryPoint: 'src/plugin.js',
    },
  })
  backend?: PluginMainBackend;

  @ApiProperty({
    description:
      "The plugin's database migrations entry. When present, the host runs the exported up-migrations on load (boot) and the down-migrations on uninstall, tracked in a plugin-scoped migrations table.",
    type: PluginMainMigrations,
    required: false,
  })
  migrations?: PluginMainMigrations;
}

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
