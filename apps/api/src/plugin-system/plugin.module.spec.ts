import { dataSourceConfig } from '../database/datasource';
import 'reflect-metadata';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ModuleRef } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { User } from '@attraccess/database-entities';
import { PluginPermission, PluginPermissionError, PLUGIN_AUDIT_HOST_PROVIDER } from '@attraccess/plugins-backend-sdk';
import { PluginModule } from './plugin.module';
import { PluginService } from './plugin.service';
import { PluginSandboxService } from './plugin-sandbox.service';
import { PluginEventsService } from './plugin-events.service';
import { PluginMqttService } from './plugin-mqtt.service';
import { PluginController } from './plugin.controller';
import { NpmPluginService } from './npm-plugin.service';
import { PluginClassificationService } from './plugin-classification.service';
import { SettingsModule } from '../settings/settings.module';
import { MqttModule } from '../mqtt/mqtt.module';
import { LoadedPluginManifest } from './plugin.manifest';
import { MqttCredentialProvisioningService } from '../mqtt/mqtt-credential-provisioning.service';
import { ResourceFlowsExecutorService } from '../resources/flows/resource-flows-executor.service';

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
    it.each([false, true])('registers unique declared entities only with database access: %s', (allowed) => {
      const registry = dataSourceConfig.entities as unknown[];
      const previous = [...registry];
      try {
        mkdirSync(join(root, 'entities/dist'), { recursive: true });
        writeFileSync(
          join(root, 'entities/plugin.json'),
          JSON.stringify({
            name: 'entities',
            version: '1.0.0',
            main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
            permissions: allowed ? [PluginPermission.DATABASE_ACCESS] : [],
            attraccessVersion: { min: '1.0.0' },
          }),
        );
        writeFileSync(
          join(root, 'entities/dist/index.js'),
          'class Widget {} class WidgetModule {} module.exports = { default: { entities: [Widget, Widget], register: () => ({ module: WidgetModule }) } };',
        );
        PluginModule.forRoot();
        expect(registry.length).toBe(previous.length + (allowed ? 1 : 0));
        if (allowed) expect((registry.at(-1) as { name: string }).name).toBe('Widget');
      } finally {
        registry.splice(0, registry.length, ...previous);
      }
    });

    it('exposes only the host providers and controller when plugins are disabled', () => {
      PluginModule.configure({ DISABLE_PLUGINS: true });
      const module = PluginModule.forRoot();
      expect(module.providers).toEqual([
        PluginService,
        PluginSandboxService,
        PluginEventsService,
        PluginMqttService,
        NpmPluginService,
        PluginClassificationService,
      ]);
      expect(module.exports).toEqual([PluginEventsService]);
      expect(module.controllers).toEqual([PluginController]);
      expect(module.imports).toEqual([SettingsModule, MqttModule]);
    });

    it('builds an empty import list when no plugins are present', () => {
      const module = PluginModule.forRoot();
      expect(module.imports).toEqual([SettingsModule, MqttModule]);
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
        }),
      );

      const discovered = PluginService.getPlugins();
      expect(discovered).toHaveLength(1);

      const module = PluginModule.forRoot();
      expect(module.imports).toEqual([SettingsModule, MqttModule]);
      expect(PluginService.getManifestById(discovered[0].id)).toBeDefined();
    });

    it('does not import a plugin persisted as quarantined after a previous failure', () => {
      mkdirSync(join(root, 'quarantined', 'dist'), { recursive: true });
      writeFileSync(
        join(root, 'quarantined', 'plugin.json'),
        JSON.stringify({
          name: 'quarantined',
          version: '1.0.0',
          main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
          attraccessVersion: { min: '1.0.0' },
        }),
      );
      writeFileSync(join(root, 'quarantined', 'dist', 'index.js'), 'throw new Error("must not be imported");');
      const [plugin] = PluginService.getPlugins();
      PluginService.quarantinePlugin(plugin, new Error('prior crash'));

      expect(PluginModule.forRoot().imports).toEqual([SettingsModule, MqttModule]);
      expect(PluginService.getPluginsWithLoadStatus()[0]).toMatchObject({ status: 'error', error: 'prior crash' });
    });

    it('does not register a credential provider from a plugin whose factory fails', () => {
      mkdirSync(join(root, 'broken-provider', 'dist'), { recursive: true });
      writeFileSync(
        join(root, 'broken-provider', 'plugin.json'),
        JSON.stringify({
          name: 'broken-provider',
          version: '1.0.0',
          main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
          attraccessVersion: { min: '1.0.0' },
        }),
      );
      writeFileSync(
        join(root, 'broken-provider', 'dist', 'index.js'),
        [
          'module.exports = {',
          "  default: { register: () => { throw new Error('register failed'); }, credentialProvisioningProvider: () => ({ id: 'orphan' }) }",
          '};',
        ].join('\n'),
      );
      const register = jest.spyOn(MqttCredentialProvisioningService, 'register');

      expect(PluginModule.forRoot().imports).toEqual([SettingsModule, MqttModule]);
      expect(register).not.toHaveBeenCalled();
    });

    it('loads a plugin whose externalized host-shared requires resolve to the host copy', () => {
      // The plugin dir lives under a tmp root outside the host node_modules tree
      // (mirroring production, where plugins sit under STORAGE_ROOT and the host
      // installs node_modules under dist/apps/api). Its index.js does a bare
      // require('@nestjs/common') — exactly what an externalized backend ships.
      // Without host-aware resolution this throws "Cannot find module".
      mkdirSync(join(root, 'needs-host-dep', 'dist'), { recursive: true });
      writeFileSync(
        join(root, 'needs-host-dep', 'plugin.json'),
        JSON.stringify({
          name: 'needs-host-dep',
          version: '1.0.0',
          main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
          attraccessVersion: { min: '1.0.0' },
        }),
      );
      writeFileSync(
        join(root, 'needs-host-dep', 'dist', 'index.js'),
        [
          "const nest = require('@nestjs/common');",
          'if (typeof nest.Module !== "function") { throw new Error("host @nestjs/common not resolved"); }',
          'class NeedsHostDepModule {}',
          'module.exports = { default: { register: () => ({ module: NeedsHostDepModule }) } };',
        ].join('\n'),
      );

      const module = PluginModule.forRoot();
      expect(module.imports).toEqual([SettingsModule, MqttModule, expect.any(Object)]);
    });
  });

  describe('createPluginContext', () => {
    const events = new EventEmitter2();
    const dataSource = { kind: 'host-datasource' } as unknown as DataSource;
    const moduleRef = { get: jest.fn((token: unknown) => ({ token })) } as unknown as ModuleRef;

    function build(permissions: PluginPermission[]) {
      new PluginModule(dataSource, events, moduleRef);
      return (
        PluginModule as unknown as {
          createPluginContext(m: LoadedPluginManifest): import('@attraccess/plugins-backend-sdk').PluginContext;
        }
      ).createPluginContext(manifest({ permissions }));
    }

    it('projects the manifest down to public info', () => {
      const ctx = build([]);
      expect(ctx.manifest).toEqual({
        id: 'plugin-id',
        name: 'ctx-plugin',
        version: '1.0.0',
        pluginDirectory: 'ctx-plugin',
      });
    });

    it('exposes the audit sink through the guarded context with host-bound plugin identity', async () => {
      const record = jest.fn(async () => ({ status: 'recorded' as const }));
      (moduleRef.get as jest.Mock).mockImplementation((token: unknown) =>
        token === PLUGIN_AUDIT_HOST_PROVIDER ? { record } : undefined,
      );
      await expect(
        build([]).audit.record({
          action: 'demo.claim',
          operationId: 'operation-id',
          outcome: 'succeeded',
          principal: { userId: 7, authenticationMethod: 'session' },
          subject: { type: 'demo.device', id: 2 },
          details: {},
        }),
      ).resolves.toEqual({ status: 'recorded' });
      expect(record).toHaveBeenCalledWith(expect.objectContaining({ pluginId: 'plugin-id' }));
      expect(moduleRef.get).toHaveBeenCalledWith(PLUGIN_AUDIT_HOST_PROVIDER, { strict: false });
    });

    it('hands back the live host DataSource when DATABASE_ACCESS is granted', () => {
      expect(build([PluginPermission.DATABASE_ACCESS]).dataSource).toBe(dataSource);
      expect(() => build([]).dataSource).toThrow(PluginPermissionError);
    });

    it('lets a plugin constructor retain a repository before the host DataSource is injected', async () => {
      class Widget {}
      const find = jest.fn(async () => [new Widget()]);
      const repository = { find };
      const host = { getRepository: jest.fn(() => repository) } as unknown as DataSource;
      const internals = PluginModule as unknown as {
        dataSourceRef: DataSource | null;
        createPluginContext(m: LoadedPluginManifest): import('@attraccess/plugins-backend-sdk').PluginContext;
      };
      internals.dataSourceRef = null;

      const context = internals.createPluginContext(manifest({ permissions: [PluginPermission.DATABASE_ACCESS] }));
      const retained = context.getRepository(Widget);
      expect(host.getRepository).not.toHaveBeenCalled();
      expect(() => retained.find()).toThrow(/accessed before bootstrap completed/);

      new PluginModule(host, events, moduleRef);
      await expect(retained.find()).resolves.toEqual([expect.any(Widget)]);
      expect(host.getRepository).toHaveBeenCalledWith(Widget);
      expect(find).toHaveBeenCalledTimes(1);
    });

    it('rechecks entity metadata permissions before resolving a retained repository', async () => {
      const find = jest.fn(async () => [new User()]);
      const host = {
        getMetadata: jest.fn(() => ({ target: User })),
        getRepository: jest.fn(() => ({ find })),
      } as unknown as DataSource;
      const internals = PluginModule as unknown as {
        resetHostReferences(): void;
        createPluginContext(m: LoadedPluginManifest): import('@attraccess/plugins-backend-sdk').PluginContext;
      };
      internals.resetHostReferences();

      const denied = internals.createPluginContext(manifest({ permissions: [PluginPermission.DATABASE_ACCESS] }));
      const retained = denied.getRepository('user');
      new PluginModule(host, events, moduleRef);

      expect(() => retained.find()).toThrow(/READ_USERS/);
      expect(host.getRepository).not.toHaveBeenCalled();
      expect(find).not.toHaveBeenCalled();

      internals.resetHostReferences();
      const allowed = internals.createPluginContext(
        manifest({ permissions: [PluginPermission.DATABASE_ACCESS, PluginPermission.READ_USERS] }),
      );
      const permitted = allowed.getRepository('user');
      new PluginModule(host, events, moduleRef);
      await expect(permitted.find()).resolves.toEqual([expect.any(User)]);
      expect(host.getRepository).toHaveBeenCalledWith('user');
    });

    it('does not hand the second application a repository from the closed configuration application', async () => {
      class Widget {}
      const first = { getRepository: jest.fn(() => ({ find: async () => ['closed'] })) } as unknown as DataSource;
      const find = jest.fn(async () => ['live']);
      const second = { getRepository: jest.fn(() => ({ find })) } as unknown as DataSource;
      const internals = PluginModule as unknown as {
        resetHostReferences(): void;
        createPluginContext(m: LoadedPluginManifest): import('@attraccess/plugins-backend-sdk').PluginContext;
      };
      new PluginModule(first, events, moduleRef);
      internals.resetHostReferences();

      const context = internals.createPluginContext(manifest({ permissions: [PluginPermission.DATABASE_ACCESS] }));
      const retained = context.getRepository(Widget);
      new PluginModule(second, events, moduleRef);

      await expect(retained.find()).resolves.toEqual(['live']);
      expect(first.getRepository).not.toHaveBeenCalled();
      expect(second.getRepository).toHaveBeenCalledWith(Widget);
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

    it('delegates permitted flow triggers to the host executor', async () => {
      const triggerPluginFlows = jest.fn(async () => undefined);
      (moduleRef.get as jest.Mock).mockImplementation((token: unknown) =>
        token === ResourceFlowsExecutorService ? { triggerPluginFlows } : { token },
      );

      await build([PluginPermission.TRIGGER_FLOWS]).flows.trigger('plugin.test.trigger', () => true, { event: 'x' });
      expect(triggerPluginFlows).toHaveBeenCalledWith('ctx-plugin', 'plugin.test.trigger', expect.any(Function), {
        event: 'x',
      });
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
