import { registerPluginModuleFixture } from './plugin.module.plugin-module.test-fixture';
import 'reflect-metadata';
import { EMPTY } from 'rxjs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ModuleRef } from '@nestjs/core';
import {
  PLUGIN_AUDIT_HOST_PROVIDER,
  PluginPermission,
  PluginPermissionError,
  definePluginStorage,
  f,
  step,
  table,
} from '@attraccess/plugins-backend-sdk';
import { handleOfScope } from './persistence/plugin-transaction-scope';
import { compilePluginStorage } from './plugin-storage/storage-schema';
import type { CompiledPluginStorage } from './plugin-storage/storage-model';
import { LicenseService } from '../license/license.service';
import { PluginModule } from './plugin.module';
import { resolveAppVersion } from '../config/app.config';
import { PluginLiveUpdatesService } from './plugin-live-updates.service';
import { LoadedPluginManifest } from './plugin.manifest';
import { ResourceFlowsExecutorService } from '../resources/flows/execution/resource-flows-executor.service';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PluginService } from './plugin.service';
import { PluginSandboxService } from './plugin-sandbox.service';
import { PluginEventsService } from './plugin-events.service';
import { PluginMqttService } from './plugin-mqtt.service';
import { PluginController } from './plugin.controller';
import { NpmPluginService } from './npm-plugin.service';
import { PluginAdministrationService } from './plugin-administration.service';
import { PluginUninstallService } from './plugin-uninstall.service';
import { PluginClassificationService } from './plugin-classification.service';
import { SettingsModule } from './../settings/settings.module';
import { LiveTopicsModule } from './../live-updates/live-topics.module';
import { MqttModule } from './../mqtt/mqtt.module';
import { PluginPersistenceModule } from '../database/adapters/plugins/plugin-persistence.module';
import { MqttCredentialProvisioningService } from './../mqtt/mqtt-credential-provisioning.service';
import * as readerUiWiring from './runtime/reader-ui-wiring';
import { PluginSystemEventsBridge } from './plugin-system-events.bridge';
import { PluginBleService } from './ble/plugin-ble.service';
import {
  listPluginNotificationCategories,
  unregisterPluginNotificationCategories,
} from '../notifications/plugin-notification-categories';

/** The host modules every plugin module list starts with. */
const HOST_IMPORTS = [SettingsModule, MqttModule, LiveTopicsModule, PluginPersistenceModule];

describe('PluginModule', () => {
  const fixture = registerPluginModuleFixture();

  describe('forRoot', () => {
    const writeStoragePlugin = (name: string, permissions: string[], source: string) => {
      mkdirSync(join(fixture.root, `${name}/dist`), { recursive: true });
      writeFileSync(
        join(fixture.root, `${name}/plugin.json`),
        JSON.stringify({
          name,
          version: '1.0.0',
          main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
          permissions,
          attraccessVersion: { min: '2.0.0-0' },
        }),
      );
      writeFileSync(join(fixture.root, `${name}/dist/index.js`), source);
    };
    const storagePlugin = (tableName: string, extra = '') => `
      const { definePluginStorage, f, step, table } = require('@attraccess/plugins-backend-sdk');
      const things = table({ id: f.id() }${extra});
      class ThingsModule {}
      exports.default = {
        storage: definePluginStorage({ tables: { ${tableName}: things }, migrations: [{ version: 1, name: 'baseline', steps: [step.createTable('${tableName}', things)] }] }),
        register: () => ({ module: ThingsModule }),
      };`;

    it('loads a plugin that declares storage and asks for PLUGIN_STORAGE', () => {
      writeStoragePlugin('storing', [PluginPermission.PLUGIN_STORAGE], storagePlugin('things'));

      const module = PluginModule.forRoot();

      expect(module.imports).toHaveLength(HOST_IMPORTS.length + 1);
      expect(PluginService.getPluginsWithLoadStatus().find(({ name }) => name === 'storing')?.status).not.toBe('error');
    });

    it('quarantines a plugin that declares storage without PLUGIN_STORAGE', () => {
      writeStoragePlugin('no-permission', [], storagePlugin('things'));

      const module = PluginModule.forRoot();

      expect(module.imports).toEqual(HOST_IMPORTS);
      expect(PluginService.getPluginsWithLoadStatus().find(({ name }) => name === 'no-permission')).toMatchObject({
        status: 'error',
        error: expect.stringContaining('PLUGIN_STORAGE'),
      });
    });

    it('quarantines a plugin whose tables leave its namespace or collide with another plugin', () => {
      const taken = `, { physicalName: 'plugin_collide_things' }`;
      writeStoragePlugin('collide', [PluginPermission.PLUGIN_STORAGE], storagePlugin('things'));
      writeStoragePlugin('intruder', [PluginPermission.PLUGIN_STORAGE], storagePlugin('things', taken));
      writeStoragePlugin('user-table', [PluginPermission.PLUGIN_STORAGE], storagePlugin('things', `, { physicalName: 'user' }`));

      PluginModule.forRoot();

      const status = (name: string) => PluginService.getPluginsWithLoadStatus().find((plugin) => plugin.name === name);
      expect(status('collide')?.status).not.toBe('error');
      expect(status('intruder')).toMatchObject({ status: 'error', error: expect.stringContaining('physicalName') });
      expect(status('user-table')).toMatchObject({ status: 'error', error: expect.stringContaining('physicalName') });
    });

    it.each([
      ['the connection', 'class DataSource {}'],
      ['an entity manager by token', "'EntityManager'"],
      ['a repository by token', "'WidgetRepository'"],
    ])('quarantines a plugin module that injects %s', (_label, token) => {
      writeStoragePlugin(
        'injector',
        [],
        `const { Inject } = require('@nestjs/common');
        class Service {}
        Inject(${token})(Service, undefined, 0);
        class M {}
        exports.default = { register: () => ({ module: M, providers: [Service] }) };`,
      );

      const module = PluginModule.forRoot();

      expect(module.imports).toEqual(HOST_IMPORTS);
      expect(PluginService.getPluginsWithLoadStatus().find(({ name }) => name === 'injector')).toMatchObject({
        status: 'error',
        error: expect.stringContaining('database handle'),
      });
    });

    it('refuses an SDK 1.x plugin before it loads or reaches the database', () => {
      mkdirSync(join(fixture.root, 'legacy/dist'), { recursive: true });
      writeFileSync(
        join(fixture.root, 'legacy/plugin.json'),
        JSON.stringify({
          name: 'legacy',
          version: '1.0.0',
          main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
          permissions: ['DATABASE_ACCESS'],
          attraccessVersion: { min: '1.11.0-0' },
        }),
      );
      writeFileSync(
        join(fixture.root, 'legacy/dist/index.js'),
        'throw new Error("a refused plugin must never be required");',
      );
      const module = PluginModule.forRoot();
      expect(module.imports).toEqual(HOST_IMPORTS);
      const errors = (PluginService as unknown as { pluginLoadErrors: Map<string, Error> }).pluginLoadErrors;
      expect(errors.get('legacy@1.0.0')?.message).toContain('migrating-to-2');
    });

    it('still loads a plugin when a refused 1.x copy of the same name sits next to it', () => {
      const write = (folder: string, version: string, min: string, code: string) => {
        mkdirSync(join(fixture.root, folder, 'dist'), { recursive: true });
        writeFileSync(
          join(fixture.root, folder, 'plugin.json'),
          JSON.stringify({
            name: 'twin',
            version,
            main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
            attraccessVersion: { min },
          }),
        );
        writeFileSync(join(fixture.root, folder, 'dist', 'index.js'), code);
      };
      // Both orders of discovery: the refused copy must never take the name from the compatible one.
      write('a-twin-legacy', '1.0.0', '1.11.0-0', 'throw new Error("a refused plugin must never be required");');
      write(
        'b-twin',
        '2.0.0',
        '2.0.0-0',
        'class Twin {}\nmodule.exports = { default: { register: () => ({ module: Twin }) } };',
      );
      write('z-twin-legacy', '1.0.1', '1.11.0-0', 'throw new Error("a refused plugin must never be required");');

      const module = PluginModule.forRoot();
      expect(module.imports).toEqual([...HOST_IMPORTS, expect.any(Object)]);
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
        PluginAdministrationService,
        PluginUninstallService,
        PluginClassificationService,
        PluginLiveUpdatesService,
        PluginSystemEventsBridge,
        PluginBleService,
      ]);
      expect(module.exports).toEqual([PluginEventsService]);
      expect(module.controllers).toEqual([PluginController]);
      expect(module.imports).toEqual(HOST_IMPORTS);
    });

    it('builds an empty import list when no plugins are present', () => {
      const module = PluginModule.forRoot();
      expect(module.imports).toEqual(HOST_IMPORTS);
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
          attraccessVersion: { min: '2.0.0-0' },
        }),
      );

      const discovered = PluginService.getPlugins();
      expect(discovered).toHaveLength(1);

      const module = PluginModule.forRoot();
      expect(module.imports).toEqual(HOST_IMPORTS);
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
          attraccessVersion: { min: '2.0.0-0' },
        }),
      );
      writeFileSync(join(fixture.root, 'quarantined', 'dist', 'index.js'), 'throw new Error("must not be imported");');
      const [plugin] = PluginService.getPlugins();
      PluginService.quarantinePlugin(plugin, new Error('prior crash'));

      expect(PluginModule.forRoot().imports).toEqual(HOST_IMPORTS);
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
          attraccessVersion: { min: '2.0.0-0' },
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

      expect(PluginModule.forRoot().imports).toEqual(HOST_IMPORTS);
      expect(register).not.toHaveBeenCalled();
    });

    it.each([
      ['a throwing register()', "register: () => { throw new Error('register failed'); }", false],
      [
        'a throwing credential provider',
        "register: () => ({ module: class M {} }), credentialProvisioningProvider: () => { throw new Error('x'); }",
        false,
      ],
      ['a module that builds', 'register: () => ({ module: class M {} })', true],
      ['a static module', 'module: class StaticModule {}', true],
    ])('queues reader UI hooks only once the module was built (%s)', (_name, body, queued) => {
      mkdirSync(join(fixture.root, 'hooked', 'dist'), { recursive: true });
      writeFileSync(
        join(fixture.root, 'hooked', 'plugin.json'),
        JSON.stringify({
          name: 'hooked',
          version: '1.0.0',
          main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
          permissions: [PluginPermission.ACCESS_HOOKS],
          attraccessVersion: { min: '2.0.0-0' },
        }),
      );
      writeFileSync(
        join(fixture.root, 'hooked', 'dist', 'index.js'),
        `module.exports = { default: { preStartHook: () => ({ decision: 'allow' }), ${body} } };`,
      );
      const queue = jest.spyOn(readerUiWiring, 'queueReaderUiContributions').mockImplementation(() => undefined);
      jest.spyOn(readerUiWiring, 'queueReaderUiLoadFailure').mockImplementation(() => undefined);
      PluginModule.forRoot();
      if (queued)
        expect(queue).toHaveBeenCalledWith('hooked', expect.objectContaining({ preStartHook: expect.any(Function) }));
      else expect(queue).not.toHaveBeenCalled();
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
          attraccessVersion: { min: '2.0.0-0' },
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
      expect(module.imports).toEqual([...HOST_IMPORTS, expect.any(Object)]);
    });
  });

  describe('createPluginContext', () => {
    const events = new EventEmitter2();
    const dataSource = { kind: 'host-datasource' };
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

    it('exposes the host version that plugin compatibility is checked against', () => {
      expect(build([]).hostVersion).toBe(resolveAppVersion());
      expect(build([]).hostVersion).toMatch(/^\d+\.\d+\.\d+/);
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

    it('gates the persistence and storage contexts behind PLUGIN_STORAGE and exposes no engine surface', () => {
      const context = build([PluginPermission.PLUGIN_STORAGE]);
      expect(typeof context.persistence.transaction).toBe('function');
      expect(typeof context.storage.open).toBe('function');
      expect(Object.keys(context.persistence)).toEqual(['transaction']);
      expect(() => build([]).persistence).toThrow(PluginPermissionError);
      expect(() => build([]).storage).toThrow(PluginPermissionError);
      for (const removed of ['dataSource', 'getRepository', 'runSerialized']) expect(removed in context).toBe(false);
    });

    describe('record port', () => {
      type StorageInternals = {
        connectionRef: object | null;
        resetHostReferences(): void;
        createPluginContext(
          m: LoadedPluginManifest,
          storage: CompiledPluginStorage | null,
        ): import('@attraccess/plugins-backend-sdk').PluginContext;
      };
      const internals = PluginModule as unknown as StorageInternals;
      const notes = table({ id: f.id(), message: f.string() });
      const definition = definePluginStorage({
        tables: { notes },
        migrations: [{ version: 1, name: 'baseline', steps: [step.createTable('notes', notes)] }],
      });
      const compiled = compilePluginStorage('ctx-plugin', definition, { reservedTables: new Set() });
      const manifest = () => fixture.manifest({ permissions: [PluginPermission.PLUGIN_STORAGE] });
      const host = (rows: unknown[]) => ({ manager: { query: jest.fn(async () => rows) } });

      it('lets a plugin retain its tables before the host connection is injected', async () => {
        internals.connectionRef = null;
        const context = internals.createPluginContext(manifest(), compiled);
        const retained = context.storage.open(definition);
        const source = host([{ id: 1, message: 'hi' }]);

        await expect(retained.notes.find()).rejects.toThrow(/not available yet/);

        new PluginModule(source as never, events, moduleRef);
        await expect(retained.notes.find()).resolves.toEqual([{ id: 1, message: 'hi' }]);
        expect(source.manager.query).toHaveBeenCalledTimes(1);
      });

      it('serves only the definition the plugin registered, never another table', () => {
        new PluginModule(host([]) as never, events, moduleRef);
        const context = internals.createPluginContext(manifest(), compiled);
        const other = definePluginStorage({ tables: {}, migrations: [] });

        expect(() => context.storage.open(definition)).not.toThrow();
        expect(() => context.storage.open(other)).toThrow(/registered/);
        expect(() => internals.createPluginContext(manifest(), null).storage.open(definition)).toThrow(/registered/);
      });

      it('does not hand the second application a connection from the closed configuration application', async () => {
        const first = host([{ id: 1, message: 'closed' }]);
        const second = host([{ id: 2, message: 'live' }]);
        new PluginModule(first as never, events, moduleRef);
        internals.resetHostReferences();
        const retained = internals.createPluginContext(manifest(), compiled).storage.open(definition);
        new PluginModule(second as never, events, moduleRef);

        await expect(retained.notes.find()).resolves.toEqual([{ id: 2, message: 'live' }]);
        expect(first.manager.query).not.toHaveBeenCalled();
      });
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

  describe('persistence.transaction', () => {
    type Internals = {
      createPluginContext(m: LoadedPluginManifest): import('@attraccess/plugins-backend-sdk').PluginContext;
    };

    it('runs the callback in a transaction of the host connection and hands an opaque scope carrying that transaction', async () => {
      const transaction = jest.fn(async (work: (manager: unknown) => Promise<unknown>) => work('tx-manager'));
      const host = {
        manager: { connection: { options: { type: 'postgres' } }, transaction },
      };
      new PluginModule(host, new EventEmitter2(), { get: jest.fn() } as unknown as ModuleRef);
      const context = (PluginModule as unknown as Internals).createPluginContext(
        fixture.manifest({ permissions: [PluginPermission.PLUGIN_STORAGE] }),
      );

      await expect(
        context.persistence.transaction(async (scope) => `ran:${String(handleOfScope(scope))}`),
      ).resolves.toBe('ran:tx-manager');
      expect(transaction).toHaveBeenCalledTimes(1);
    });

    it('runs post-commit work after the transaction and rejects a nested transaction', async () => {
      const order: string[] = [];
      const transaction = jest.fn(async (work: (manager: unknown) => Promise<unknown>) => {
        const result = await work('tx-manager');
        order.push('commit');
        return result;
      });
      new PluginModule(
        { manager: { connection: { options: { type: 'postgres' } }, transaction } },
        new EventEmitter2(),
        {
          get: jest.fn(),
        } as unknown as ModuleRef,
      );
      const context = (PluginModule as unknown as Internals).createPluginContext(
        fixture.manifest({ permissions: [PluginPermission.PLUGIN_STORAGE] }),
      );

      await context.persistence.transaction(async (scope) => {
        scope.afterCommit(() => void order.push('after'));
        await expect(context.persistence.transaction(async () => 1)).rejects.toThrow(/inside a transaction callback/);
      });
      expect(order).toEqual(['commit', 'after']);
    });

    it('is denied without PLUGIN_STORAGE', () => {
      const context = (PluginModule as unknown as Internals).createPluginContext(fixture.manifest({ permissions: [] }));
      expect(() => context.persistence).toThrow(PluginPermissionError);
    });
  });

  describe('license', () => {
    it('reaches the plugin without a permission and asks the host license service', async () => {
      const getLicenseData = jest.fn(async () => ({
        valid: true,
        modules: ['wago'],
        usageLimits: {},
        isNonProfit: false,
      }));
      const get = jest.fn((token: unknown) => (token === LicenseService ? { getLicenseData } : { token }));
      new PluginModule({} as object, new EventEmitter2(), { get } as unknown as ModuleRef);
      const context = (
        PluginModule as unknown as {
          createPluginContext(m: LoadedPluginManifest): import('@attraccess/plugins-backend-sdk').PluginContext;
        }
      ).createPluginContext(fixture.manifest({ permissions: [] }));

      await expect(context.license?.hasModule('wago')).resolves.toBe(true);
      expect(getLicenseData).toHaveBeenCalled();
    });
  });

  describe('notification categories', () => {
    function writePlugin(name: string, permissions: PluginPermission[], body: string): void {
      mkdirSync(join(fixture.root, name, 'dist'), { recursive: true });
      writeFileSync(
        join(fixture.root, name, 'plugin.json'),
        JSON.stringify({
          name,
          version: '1.0.0',
          main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
          permissions,
          attraccessVersion: { min: '2.0.0-0' },
        }),
      );
      writeFileSync(join(fixture.root, name, 'dist', 'index.js'), `module.exports = { default: { ${body} } };`);
    }
    const categories = "notificationCategories: [{ id: 'reminder', label: { en: 'Reminder', de: 'Erinnerung' } }]";

    it('registers declared categories namespaced under the plugin name', () => {
      writePlugin(
        'booking',
        [PluginPermission.SEND_NOTIFICATIONS],
        `${categories}, register: () => ({ module: class M {} })`,
      );
      PluginModule.forRoot();
      expect(listPluginNotificationCategories()).toEqual([
        expect.objectContaining({ key: 'plugin.booking.reminder', pluginName: 'booking', id: 'reminder' }),
      ]);
    });

    it('registers the categories again when the application that closed before the real one started', () => {
      writePlugin(
        'rebooted',
        [PluginPermission.SEND_NOTIFICATIONS],
        `${categories}, register: () => ({ module: class M {} })`,
      );
      const [pluginImport] = PluginModule.forRoot().imports.slice(HOST_IMPORTS.length) as Array<{
        providers: Array<{ provide: string; useFactory: () => { onModuleInit: () => void } }>;
      }>;
      const cleanup = pluginImport.providers.find((provider) =>
        String(provider.provide).startsWith('plugin-mqtt-cleanup:'),
      );
      // What closing the throwaway configuration app does to the process-wide registry.
      unregisterPluginNotificationCategories('rebooted');
      expect(listPluginNotificationCategories().some((category) => category.pluginName === 'rebooted')).toBe(false);

      cleanup.useFactory().onModuleInit();

      expect(listPluginNotificationCategories().filter((category) => category.pluginName === 'rebooted')).toEqual([
        expect.objectContaining({ key: 'plugin.rebooted.reminder', id: 'reminder' }),
      ]);
    });

    it('quarantines a plugin declaring categories without SEND_NOTIFICATIONS', () => {
      writePlugin('sneaky', [], `${categories}, register: () => ({ module: class M {} })`);
      const module = PluginModule.forRoot();
      expect(module.imports).toEqual(HOST_IMPORTS);
      expect(listPluginNotificationCategories().some((category) => category.pluginName === 'sneaky')).toBe(false);
    });

    it('leaves no category behind when register() throws', () => {
      writePlugin(
        'broken-cats',
        [PluginPermission.SEND_NOTIFICATIONS],
        `${categories}, register: () => { throw new Error('boom'); }`,
      );
      PluginModule.forRoot();
      expect(listPluginNotificationCategories().some((category) => category.pluginName === 'broken-cats')).toBe(false);
    });

    it('quarantines a plugin with a malformed email template before queueing hooks or registering categories', () => {
      const brokenTemplate =
        "emailTemplates: [{ id: 'confirmed', label: { en: 'C', de: 'B' }, variables: [], subject: '{{t \"s\" \"Hi\"}}'," +
        " body: '<mj-text>x</mj-text>', translations: { de: {} } }]";
      writePlugin(
        'broken-mail',
        [PluginPermission.SEND_NOTIFICATIONS, PluginPermission.ACCESS_HOOKS],
        `${categories}, ${brokenTemplate}, preStartHook: () => ({ decision: 'allow' }), register: () => ({ module: class M {} })`,
      );
      const queue = jest.spyOn(readerUiWiring, 'queueReaderUiContributions').mockImplementation(() => undefined);
      jest.spyOn(readerUiWiring, 'queueReaderUiLoadFailure').mockImplementation(() => undefined);

      expect(PluginModule.forRoot().imports).toEqual(HOST_IMPORTS);
      expect(queue).not.toHaveBeenCalled();
      expect(listPluginNotificationCategories().some((category) => category.pluginName === 'broken-mail')).toBe(false);
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
