import 'reflect-metadata';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ModuleRef } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { PluginPermission, PluginPermissionError } from '@attraccess/plugins-backend-sdk';
import { PluginModule } from './plugin.module';
import { PluginService } from './plugin.service';
import { PluginSandboxService } from './plugin-sandbox.service';
import { PluginController } from './plugin.controller';
import { LoadedPluginManifest } from './plugin.manifest';

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

describe('PluginModule', () => {
  let root: string;

  beforeEach(() => {
    root = newPluginDir();
    PluginModule.configure({ DISABLE_PLUGINS: false });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  describe('forRoot', () => {
    it('exposes only the host providers and controller when plugins are disabled', () => {
      PluginModule.configure({ DISABLE_PLUGINS: true });
      const module = PluginModule.forRoot();
      expect(module.providers).toEqual([PluginService, PluginSandboxService]);
      expect(module.controllers).toEqual([PluginController]);
      expect(module.imports).toBeUndefined();
    });

    it('builds an empty import list when no plugins are present', () => {
      const module = PluginModule.forRoot();
      expect(module.imports).toEqual([]);
      expect(module.controllers).toEqual([PluginController]);
    });

    it('isolates a failing plugin load without crashing the module', () => {
      mkdirSync(join(root, 'broken'), { recursive: true });
      writeFileSync(
        join(root, 'broken', 'plugin.json'),
        JSON.stringify({
          name: 'broken',
          version: '1.0.0',
          main: { backend: { directory: 'dist', entryPoint: 'missing.js' } },
          attraccessVersion: { min: '1.0.0' },
        })
      );

      const discovered = PluginService.getPlugins();
      expect(discovered).toHaveLength(1);

      const module = PluginModule.forRoot();
      expect(module.imports).toEqual([]);
      expect(PluginService.getManifestById(discovered[0].id)).toBeDefined();
    });
  });

  describe('createPluginContext', () => {
    const events = new EventEmitter2();
    const dataSource = { kind: 'host-datasource' } as unknown as DataSource;
    const moduleRef = { get: jest.fn((token: unknown) => ({ token })) } as unknown as ModuleRef;

    function build(permissions: PluginPermission[]) {
      new PluginModule(dataSource, events, moduleRef);
      return (
        PluginModule as unknown as { createPluginContext(m: LoadedPluginManifest): import('@attraccess/plugins-backend-sdk').PluginContext }
      ).createPluginContext(manifest({ permissions }));
    }

    it('projects the manifest down to public info', () => {
      const ctx = build([]);
      expect(ctx.manifest).toEqual({ id: 'plugin-id', name: 'ctx-plugin', version: '1.0.0', pluginDirectory: 'ctx-plugin' });
    });

    it('hands back the live host DataSource when DATABASE_ACCESS is granted', () => {
      expect(build([PluginPermission.DATABASE_ACCESS]).dataSource).toBe(dataSource);
      expect(() => build([]).dataSource).toThrow(PluginPermissionError);
    });

    it('resolves host providers through the ModuleRef when permitted', () => {
      const ctx = build([PluginPermission.RESOLVE_HOST_PROVIDERS]);
      ctx.get('SOME_TOKEN');
      expect(moduleRef.get).toHaveBeenCalledWith('SOME_TOKEN', { strict: false });
      expect(() => build([]).get('SOME_TOKEN')).toThrow(/RESOLVE_HOST_PROVIDERS/);
    });

    it('gates the shared event bus behind EMIT/LISTEN permissions', () => {
      expect(() => build([PluginPermission.EMIT_EVENTS]).events.emit('x')).not.toThrow();
      expect(() => build([]).events.emit('x')).toThrow(/EMIT_EVENTS/);
    });
  });

  describe('requireRef', () => {
    const requireRef = (PluginModule as unknown as { requireRef<T>(ref: T | null, name: string): T }).requireRef;

    it('throws a bootstrap-ordering error when a host singleton is missing', () => {
      expect(() => requireRef(null, 'EventEmitter2')).toThrow(/accessed before bootstrap completed/);
    });

    it('returns the reference when it is available', () => {
      const ref = {};
      expect(requireRef(ref, 'DataSource')).toBe(ref);
    });
  });
});
