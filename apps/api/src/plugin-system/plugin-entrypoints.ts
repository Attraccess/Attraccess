import { ApiProperty } from '@nestjs/swagger';

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
