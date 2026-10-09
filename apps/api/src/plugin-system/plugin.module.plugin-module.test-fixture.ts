import 'reflect-metadata';

import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { LoadedPluginManifest } from './plugin.manifest';
import { PluginModule } from './plugin.module';
import { PluginService } from './plugin.service';

function newPluginDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'plugin-module-'));
  PluginService.configure({ PLUGIN_DIR: dir, RESTART_BY_EXIT: true });
  return dir;
}

function manifest(overrides: Partial<LoadedPluginManifest> = {}): LoadedPluginManifest {
  return {
    id: 'plugin-id',
    name: 'ctx-plugin',
    version: '1.0.0',
    pluginDirectory: 'ctx-plugin',
    permissions: [],
    main: { backend: { directory: 'ctx-plugin/dist', entryPoint: 'index.js' } },
    attraccessVersion: { min: '1.0.0' },
    ...overrides,
  } as LoadedPluginManifest;
}
export function registerPluginModuleFixture() {
  let root: string;

  beforeEach(() => {
    root = newPluginDir();
    PluginModule.configure({ DISABLE_PLUGINS: false });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });
  return {
    get manifest() {
      return manifest;
    },
    get root() {
      return root;
    },
  };
}
