import { ApiProperty } from '@nestjs/swagger';
import { PluginPermission } from '@attraccess/plugins-backend-sdk';
import { z } from 'zod';

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

export class PluginManifest {
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

const mainSchema = z.object({
  directory: z.string(),
  entryPoint: z.string(),
});

export const PluginManifestSchema = z.object({
  name: z.string(),
  main: z.object({
    frontend: mainSchema,
    backend: mainSchema,
  }),
  version: z.string(),
  attraccessVersion: z
    .object({
      min: z.string().optional(),
      max: z.string().optional(),
      exact: z.string().optional(),
    })
    .refine(
      (data) => {
        if (data.min && data.max) {
          return data.min <= data.max;
        }

        return true;
      },
      { message: 'min must be less than or equal to max' }
    )
    .refine(
      (data) => {
        if (!data.min && !data.max && !data.exact) {
          return false;
        }

        return true;
      },
      { message: 'min, max or exact must be provided' }
    ),
  permissions: z
    .array(z.nativeEnum(PluginPermission, { message: 'unknown plugin permission' }))
    .optional()
    .default([]),
});
