// Keep plugin execution in Jest's realm, just as the production loader shares the host realm.
jest.mock('vm', () => ({ ...jest.requireActual('vm'), runInThisContext: (source: string) => eval(source) }));
jest.mock('module', () => ({ ...jest.requireActual('module'), createRequire: () => require }));
import { assertPluginBackendSupport } from './persistence/port';
import { resetPluginFlowRegistry } from './flows/node-registry';
import { resetPluginAuditRegistry } from './audit/audit-registry';
import { registerPluginModuleFixture } from './plugin.module.plugin-module.test-fixture';
import 'reflect-metadata';
import { EMPTY } from 'rxjs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ModuleRef } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { entities, User } from '@attraccess/database-entities';
import { PLUGIN_AUDIT_HOST_PROVIDER, PluginPermission, PluginPermissionError } from '@attraccess/plugins-backend-sdk';
import { PluginModule } from './plugin.module';
import { PluginLiveUpdatesService } from './plugin-live-updates.service';
import { LoadedPluginManifest } from './plugin.manifest';
import { ResourceFlowsExecutorService } from '../resources/flows/execution/resource-flows-executor.service';
import { dataSourceConfig } from './../database/datasource';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'path';
import { Test } from '@nestjs/testing';
import { parseNpmPluginPackage } from './npm/contract-validation';
import { join } from 'path';
import { PluginService } from './plugin.service';
import { PluginSandboxService } from './plugin-sandbox.service';
import { PluginEventsService } from './plugin-events.service';
import { PluginMqttService } from './plugin-mqtt.service';
import { PluginController } from './plugin.controller';
import { NpmPluginService } from './npm-plugin.service';
import { PluginClassificationService } from './plugin-classification.service';
import { SettingsModule } from './../settings/settings.module';
import { LiveTopicsModule } from './../live-updates/live-topics.module';
import { MqttModule } from './../mqtt/mqtt.module';
import { MqttCredentialProvisioningService } from './../mqtt/mqtt-credential-provisioning.service';
import { SqlitePluginAdapters } from './persistence/plugin-adapters';
import { pluginOperationToken } from '@attraccess/plugins-backend-sdk/v2';
import type { PluginContext as NeutralPluginContext } from '@attraccess/plugins-backend-sdk/v2';

describe('PluginModule', () => {
  const fixture = registerPluginModuleFixture();

  describe('forRoot', () => {
    it.each(['direct', 'npm'])(
      'loads WAGO from the shipped %s manifest through host context selection',
      async (kind) => {
        resetPluginFlowRegistry();
        resetPluginAuditRegistry();
        const wago = resolve(__dirname, '../../../plugins/wago');
        const manifest =
          kind === 'direct'
            ? JSON.parse(readFileSync(join(wago, 'plugin.json'), 'utf8'))
            : parseNpmPluginPackage(JSON.parse(readFileSync(join(wago, 'package.json'), 'utf8')), '1.11.0').manifest;
        expect(manifest.persistence).toEqual({ contractVersion: 2, supportedBackends: ['sqlite'] });
        expect(() => assertPluginBackendSupport(manifest, 'postgres')).toThrow('does not support');
        mkdirSync(join(fixture.root, 'wago/dist'), { recursive: true });
        writeFileSync(join(fixture.root, 'wago/plugin.json'), JSON.stringify(manifest));
        execFileSync(process.execPath, [
          resolve(wago, '../scripts/esbuild-backend.mjs'),
          '--entry',
          join(wago, 'backend/plugin.ts'),
          '--outfile',
          join(fixture.root, 'wago/dist/index.js'),
        ]);
        PluginModule.resetHostReferences();
        const host = PluginModule.forRoot();
        const registration = host.imports.find(
          (entry) => typeof entry === 'object' && 'module' in entry && entry.module.name === 'WagoPluginModule',
        );
        expect(registration).toBeDefined();
        new PluginModule({} as DataSource, new EventEmitter2(), { get: () => ({ clearPlugin: jest.fn() }) } as never);
        const compiled = await Test.createTestingModule({ imports: [registration as never] }).compile();
        try {
          const providers = (registration as { providers: unknown[] }).providers;
          const service = providers.find((entry) => typeof entry === 'function' && entry.name === 'WagoService');
          expect(compiled.get(service as never)).toBeDefined();
        } finally {
          await compiled.close();
          PluginModule.resetHostReferences();
          resetPluginFlowRegistry();
          resetPluginAuditRegistry();
        }
      },
    );

    it('loads the neutral SDK through the production loader and supplies only guarded host operations', async () => {
      mkdirSync(join(fixture.root, 'neutral/dist'), { recursive: true });
      writeFileSync(
        join(fixture.root, 'neutral/plugin.json'),
        JSON.stringify({
          name: 'neutral',
          version: '1.0.0',
          main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
          persistence: { contractVersion: 2, supportedBackends: ['sqlite'] },
          permissions: [PluginPermission.READ_USERS],
          attraccessVersion: { min: '1.0.0' },
        }),
      );
      writeFileSync(
        join(fixture.root, 'neutral/dist/index.js'),
        `
        const { PLUGIN_CONTEXT } = require('@attraccess/plugins-backend-sdk/v2');
        class NeutralModule {}
        module.exports = { default: {
          persistence: { contractVersion: 2, supportedBackends: ['sqlite'] },
          register: context => ({ module: NeutralModule, providers: [{ provide: PLUGIN_CONTEXT, useValue: context }] })
        }};
      `,
      );
      PluginModule.resetHostReferences();
      const loaded = PluginModule.forRoot();
      const neutralModule = loaded.imports.find(
        (entry) => typeof entry === 'object' && 'module' in entry && entry.module.name === 'NeutralModule',
      ) as {
        providers: Array<{ provide: symbol; useValue: NeutralPluginContext }>;
      };
      const context = neutralModule.providers[0].useValue;
      expect(neutralModule.providers[0].provide).toBe(Symbol.for('attraccess.plugin.context'));
      expect(context).not.toHaveProperty('dataSource');
      expect(context).not.toHaveProperty('getRepository');
      expect(context).not.toHaveProperty('get');
      expect(() => context.operations.resources.findById(1)).toThrow(PluginPermissionError);
      const source = await new DataSource({
        type: 'sqlite',
        database: ':memory:',
        entities: Object.values(entities),
        synchronize: true,
      }).initialize();
      try {
        await source.getRepository(User).save({ username: 'reader', email: 'reader@example.test' });
        new PluginModule(source, new EventEmitter2(), {} as ModuleRef);
        expect(await context.operations.users.list({ limit: 5 })).toEqual([{ id: 1, username: 'reader' }]);
        expect(() => context.persistence.resolve(pluginOperationToken('undeclared'))).toThrow(PluginPermissionError);
      } finally {
        PluginModule.resetHostReferences();
        await source.destroy();
      }
    });

    it('resolves neutral operations lazily and replaces adapters after the configuration source closes', async () => {
      const token = pluginOperationToken<{ read(): string }>('connection identity', ['read']);
      let current: DataSource | undefined;
      const first = new DataSource({ type: 'sqlite', database: ':memory:' });
      const second = new DataSource({ type: 'sqlite', database: ':memory:' });
      const create = jest.fn(({ dataSource }) => ({ read: () => dataSource.name }));
      const registry = new SqlitePluginAdapters({ backend: 'sqlite', operations: [{ token, create }] }, () => {
        if (!current) throw new Error('Host source is not yet available');
        return current;
      });
      const scope = registry.bind();
      const operations = scope.resolve(token);
      expect(create).not.toHaveBeenCalled();
      await first.initialize();
      await second.initialize();
      try {
        current = first;
        const read = operations.read;
        read();
        expect(create).toHaveBeenLastCalledWith(expect.objectContaining({ dataSource: first, manager: first.manager }));
        await first.destroy();
        current = second;
        read();
        expect(create).toHaveBeenLastCalledWith(
          expect.objectContaining({ dataSource: second, manager: second.manager }),
        );
        expect(create).toHaveBeenCalledTimes(2);
      } finally {
        if (first.isInitialized) await first.destroy();
        if (second.isInitialized) await second.destroy();
      }
    });

    it('hides private adapter fields and exposes only registered methods', async () => {
      const source = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
      try {
        const token = pluginOperationToken<{ read(): number }>('reviewed reader', ['read']);
        const registry = new SqlitePluginAdapters(
          { backend: 'sqlite', operations: [{ token, create: () => ({ read: () => 7, manager: source.manager }) }] },
          () => source,
        );
        const operations = registry.bind().resolve(token);
        expect(operations.read()).toBe(7);
        expect(operations).not.toHaveProperty('manager');
        expect(Object.keys(operations)).toEqual([]);
        expect(Object.getPrototypeOf(operations)).toBe(Object.prototype);
        expect(() => Object.assign(operations, { manager: source.manager })).toThrow('read-only');
      } finally {
        await source.destroy();
      }
    });

    it('rejects closed and cross-connection plugin operation scopes', async () => {
      const source = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
      const other = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
      try {
        const token = pluginOperationToken<{ read(): string }>('read', ['read']);
        const registry = new SqlitePluginAdapters(
          { backend: 'sqlite', operations: [{ token, create: () => ({ read: () => 'value' }) }] },
          () => source,
        );
        let open = true;
        const scope = registry.bind(source.manager, () => {
          if (!open) throw new Error('Scope closed');
        });
        const read = scope.resolve(token).read;
        expect(read()).toBe('value');
        open = false;
        expect(read).toThrow('Scope closed');
        expect(() => scope.resolve(token)).toThrow('Scope closed');
        expect(() => registry.bind(other.manager).resolve(token).read()).toThrow(
          'different database backend or connection',
        );
        expect(() => registry.bind().resolve(pluginOperationToken('unregistered'))).toThrow('No adapter registered');
      } finally {
        await source.destroy();
        await other.destroy();
      }
    });

    it('rejects unsupported plugin backends before evaluating their entry or registering entities', () => {
      const registry = dataSourceConfig.entities as unknown[];
      const previous = [...registry];
      mkdirSync(join(fixture.root, 'unsupported/dist'), { recursive: true });
      writeFileSync(
        join(fixture.root, 'unsupported/plugin.json'),
        JSON.stringify({
          name: 'unsupported',
          version: '1.0.0',
          main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
          persistence: { contractVersion: 2, supportedBackends: ['postgres'] },
          permissions: [PluginPermission.DATABASE_ACCESS],
          attraccessVersion: { min: '1.0.0' },
        }),
      );
      writeFileSync(join(fixture.root, 'unsupported/dist/index.js'), 'throw new Error("entry was evaluated")');
      PluginModule.forRoot();
      expect(registry).toEqual(previous);
      const plugin = PluginService.getPluginsWithLoadStatus().find(({ name }) => name === 'unsupported');
      expect(plugin?.status).toBe('error');
      expect(plugin?.error).toContain('does not support the selected database backend');
    });

    it.each([false, true])('registers unique declared entities only with database access: %s', (allowed) => {
      const registry = dataSourceConfig.entities as unknown[];
      const previous = [...registry];
      try {
        mkdirSync(join(fixture.root, 'entities/dist'), { recursive: true });
        writeFileSync(
          join(fixture.root, 'entities/plugin.json'),
          JSON.stringify({
            name: 'entities',
            version: '1.0.0',
            main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
            permissions: allowed ? [PluginPermission.DATABASE_ACCESS] : [],
            attraccessVersion: { min: '1.0.0' },
          }),
        );
        writeFileSync(
          join(fixture.root, 'entities/dist/index.js'),
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
        PluginLiveUpdatesService,
      ]);
      expect(module.exports).toEqual([PluginEventsService]);
      expect(module.controllers).toEqual([PluginController]);
      expect(module.imports).toEqual([SettingsModule, MqttModule, LiveTopicsModule]);
    });

    it('builds an empty import list when no plugins are present', () => {
      const module = PluginModule.forRoot();
      expect(module.imports).toEqual([SettingsModule, MqttModule, LiveTopicsModule]);
      expect(module.controllers).toEqual([PluginController]);
    });

    it('isolates a failing plugin load without crashing the module', () => {
      mkdirSync(join(fixture.root, 'broken'), { recursive: true });
      writeFileSync(
        join(fixture.root, 'broken', 'plugin.json'),
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
      expect(module.imports).toEqual([SettingsModule, MqttModule, LiveTopicsModule]);
      expect(PluginService.getManifestById(discovered[0].id)).toBeDefined();
    });

    it('does not import a plugin persisted as quarantined after a previous failure', () => {
      mkdirSync(join(fixture.root, 'quarantined', 'dist'), { recursive: true });
      writeFileSync(
        join(fixture.root, 'quarantined', 'plugin.json'),
        JSON.stringify({
          name: 'quarantined',
          version: '1.0.0',
          main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
          attraccessVersion: { min: '1.0.0' },
        }),
      );
      writeFileSync(join(fixture.root, 'quarantined', 'dist', 'index.js'), 'throw new Error("must not be imported");');
      const [plugin] = PluginService.getPlugins();
      PluginService.quarantinePlugin(plugin, new Error('prior crash'));

      expect(PluginModule.forRoot().imports).toEqual([SettingsModule, MqttModule, LiveTopicsModule]);
      expect(PluginService.getPluginsWithLoadStatus()[0]).toMatchObject({ status: 'error', error: 'prior crash' });
    });

    it('does not register a credential provider from a plugin whose factory fails', () => {
      mkdirSync(join(fixture.root, 'broken-provider', 'dist'), { recursive: true });
      writeFileSync(
        join(fixture.root, 'broken-provider', 'plugin.json'),
        JSON.stringify({
          name: 'broken-provider',
          version: '1.0.0',
          main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
          attraccessVersion: { min: '1.0.0' },
        }),
      );
      writeFileSync(
        join(fixture.root, 'broken-provider', 'dist', 'index.js'),
        [
          'module.exports = {',
          "  default: { register: () => { throw new Error('register failed'); }, credentialProvisioningProvider: () => ({ id: 'orphan' }) }",
          '};',
        ].join('\n'),
      );
      const register = jest.spyOn(MqttCredentialProvisioningService, 'register');

      expect(PluginModule.forRoot().imports).toEqual([SettingsModule, MqttModule, LiveTopicsModule]);
      expect(register).not.toHaveBeenCalled();
    });

    it('loads a plugin whose externalized host-shared requires resolve to the host copy', () => {
      // The plugin dir lives under a tmp root outside the host node_modules tree
      // (mirroring production, where plugins sit under STORAGE_ROOT and the host
      // installs node_modules under dist/apps/api). Its index.js does a bare
      // require('@nestjs/common') — exactly what an externalized backend ships.
      // Without host-aware resolution this throws "Cannot find module".
      mkdirSync(join(fixture.root, 'needs-host-dep', 'dist'), { recursive: true });
      writeFileSync(
        join(fixture.root, 'needs-host-dep', 'plugin.json'),
        JSON.stringify({
          name: 'needs-host-dep',
          version: '1.0.0',
          main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
          attraccessVersion: { min: '1.0.0' },
        }),
      );
      writeFileSync(
        join(fixture.root, 'needs-host-dep', 'dist', 'index.js'),
        [
          "const nest = require('@nestjs/common');",
          'if (typeof nest.Module !== "function") { throw new Error("host @nestjs/common not resolved"); }',
          'class NeedsHostDepModule {}',
          'module.exports = { default: { register: () => ({ module: NeedsHostDepModule }) } };',
        ].join('\n'),
      );

      const module = PluginModule.forRoot();
      expect(module.imports).toEqual([SettingsModule, MqttModule, LiveTopicsModule, expect.any(Object)]);
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
      ).createPluginContext(fixture.manifest({ permissions }));
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

    it('binds live topic registration to the plugin identity through the guarded context', () => {
      const register = jest.fn(() => jest.fn());
      (moduleRef.get as jest.Mock).mockImplementation((token: unknown) =>
        token === PluginLiveUpdatesService ? { register } : undefined,
      );
      const definition = {
        topic: 'status',
        identifier: 'none' as const,
        authorize: jest.fn(),
        source: jest.fn(() => EMPTY),
      };
      build([]).liveUpdates.register(definition);
      expect(register).toHaveBeenCalledWith('plugin-id', 'ctx-plugin', definition);
      expect(moduleRef.get).toHaveBeenCalledWith(PluginLiveUpdatesService, { strict: false });
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

      const context = internals.createPluginContext(
        fixture.manifest({ permissions: [PluginPermission.DATABASE_ACCESS] }),
      );
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

      const denied = internals.createPluginContext(
        fixture.manifest({ permissions: [PluginPermission.DATABASE_ACCESS] }),
      );
      const retained = denied.getRepository('user');
      new PluginModule(host, events, moduleRef);

      expect(() => retained.find()).toThrow(/READ_USERS/);
      expect(host.getRepository).not.toHaveBeenCalled();
      expect(find).not.toHaveBeenCalled();

      internals.resetHostReferences();
      const allowed = internals.createPluginContext(
        fixture.manifest({ permissions: [PluginPermission.DATABASE_ACCESS, PluginPermission.READ_USERS] }),
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

      const context = internals.createPluginContext(
        fixture.manifest({ permissions: [PluginPermission.DATABASE_ACCESS] }),
      );
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
