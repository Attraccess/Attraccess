import { registerPluginModuleFixture } from './plugin.module.plugin-module.test-fixture';
import 'reflect-metadata';
import { EMPTY } from 'rxjs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ModuleRef } from '@nestjs/core';
import { PLUGIN_AUDIT_HOST_PROVIDER, PluginPermission, PluginPermissionError } from '@attraccess/plugins-backend-sdk';
import { sqlitePersistence } from '@attraccess/plugins-backend-sdk/sqlite';
import { PluginModule } from './plugin.module';
import { resolveAppVersion } from '../config/app.config';
import { PluginLiveUpdatesService } from './plugin-live-updates.service';
import { LoadedPluginManifest } from './plugin.manifest';
import { ResourceFlowsExecutorService } from '../resources/flows/execution/resource-flows-executor.service';
import { dataSourceConfig } from './../database/datasource';
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
import {
  listPluginNotificationCategories,
  unregisterPluginNotificationCategories,
} from '../notifications/plugin-notification-categories';

/** The host modules every plugin module list starts with. */
const HOST_IMPORTS = [SettingsModule, MqttModule, LiveTopicsModule, PluginPersistenceModule];

describe('PluginModule', () => {
  const fixture = registerPluginModuleFixture();

  describe('forRoot', () => {
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
            persistence: { backends: ['sqlite'] },
            attraccessVersion: { min: '2.0.0-0' },
          }),
        );
        writeFileSync(
          join(fixture.root, 'entities/dist/index.js'),
          'class Widget {} class WidgetModule {} module.exports = { default: { persistence: { sqlite: { entities: [Widget, Widget] } }, register: () => ({ module: WidgetModule }) } };',
        );
        PluginModule.forRoot();
        expect(registry.length).toBe(previous.length + (allowed ? 1 : 0));
        if (allowed) expect((registry.at(-1) as { name: string }).name).toBe('Widget');
      } finally {
        registry.splice(0, registry.length, ...previous);
      }
    });

    it('refuses a plugin whose storage code does not support the active engine before registering anything', () => {
      const registry = dataSourceConfig.entities as unknown[];
      const previous = [...registry];
      try {
        mkdirSync(join(fixture.root, 'other-engine/dist'), { recursive: true });
        writeFileSync(
          join(fixture.root, 'other-engine/plugin.json'),
          JSON.stringify({
            name: 'other-engine',
            version: '1.0.0',
            main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
            permissions: [PluginPermission.DATABASE_ACCESS],
            persistence: { backends: ['sqlite'] },
            attraccessVersion: { min: '2.0.0-0' },
          }),
        );
        writeFileSync(
          join(fixture.root, 'other-engine/dist/index.js'),
          'class Widget {} module.exports = { default: { persistence: { postgres: { entities: [Widget] } }, register: () => ({ module: class M {} }) } };',
        );
        const module = PluginModule.forRoot();
        expect(registry).toEqual(previous);
        expect(module.imports).toEqual(HOST_IMPORTS);
        expect(PluginService.getPluginsWithLoadStatus().find(({ name }) => name === 'other-engine')).toMatchObject({
          status: 'error',
          error: expect.stringContaining('postgres'),
        });
      } finally {
        registry.splice(0, registry.length, ...previous);
      }
    });

    it('refuses an SDK 1.x plugin before it loads, registers entities or reaches the database', () => {
      const registry = dataSourceConfig.entities as unknown[];
      const previous = [...registry];
      try {
        mkdirSync(join(fixture.root, 'legacy/dist'), { recursive: true });
        writeFileSync(
          join(fixture.root, 'legacy/plugin.json'),
          JSON.stringify({
            name: 'legacy',
            version: '1.0.0',
            main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
            permissions: [PluginPermission.DATABASE_ACCESS],
            persistence: { backends: ['sqlite'] },
            attraccessVersion: { min: '1.11.0-0' },
          }),
        );
        writeFileSync(
          join(fixture.root, 'legacy/dist/index.js'),
          'throw new Error("a refused plugin must never be required");',
        );
        const module = PluginModule.forRoot();
        expect(registry).toEqual(previous);
        expect(module.imports).toEqual(HOST_IMPORTS);
        const errors = (PluginService as unknown as { pluginLoadErrors: Map<string, Error> }).pluginLoadErrors;
        expect(errors.get('legacy@1.0.0')?.message).toContain('migrating-to-2');
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
        PluginAdministrationService,
        PluginUninstallService,
        PluginClassificationService,
        PluginLiveUpdatesService,
        PluginSystemEventsBridge,
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

    it('gates the persistence context behind DATABASE_ACCESS and names the active engine', () => {
      const context = build([PluginPermission.DATABASE_ACCESS]);
      expect(context.persistence.backend).toBe('sqlite');
      expect(context.persistence.supports('sqlite')).toBe(true);
      expect(() => build([]).persistence).toThrow(PluginPermissionError);
      expect('dataSource' in context).toBe(false);
      expect('getRepository' in context).toBe(false);
      expect('runSerialized' in context).toBe(false);
    });

    it('lets a plugin constructor retain a repository before the host connection is injected', async () => {
      class Widget {}
      const find = jest.fn(async () => [new Widget()]);
      const host = { getRepository: jest.fn(() => ({ find })) };
      const internals = PluginModule as unknown as {
        connectionRef: object | null;
        createPluginContext(
          m: LoadedPluginManifest,
          entities: unknown[],
        ): import('@attraccess/plugins-backend-sdk').PluginContext;
      };
      internals.connectionRef = null;

      const context = internals.createPluginContext(
        fixture.manifest({ permissions: [PluginPermission.DATABASE_ACCESS] }),
        [Widget],
      );
      const retained = sqlitePersistence(context).getRepository(Widget);
      expect(host.getRepository).not.toHaveBeenCalled();
      expect(() => retained.find()).toThrow(/not available yet/);

      new PluginModule(host, events, moduleRef);
      await expect(retained.find()).resolves.toEqual([expect.any(Widget)]);
      expect(host.getRepository).toHaveBeenCalledWith(Widget);
      expect(find).toHaveBeenCalledTimes(1);
    });

    it('serves repositories only for entities the plugin registered, never host tables', () => {
      class Widget {}
      class Other {}
      const host = { getRepository: jest.fn(() => ({})) };
      new PluginModule(host, events, moduleRef);
      const context = (
        PluginModule as unknown as {
          createPluginContext(
            m: LoadedPluginManifest,
            entities: unknown[],
          ): import('@attraccess/plugins-backend-sdk').PluginContext;
        }
      ).createPluginContext(fixture.manifest({ permissions: [PluginPermission.DATABASE_ACCESS] }), [Widget]);
      const sqlite = sqlitePersistence(context);

      expect(() => sqlite.getRepository(Widget)).not.toThrow();
      expect(() => sqlite.getRepository(Other)).toThrow(/registered/);
      expect(() => sqlite.getRepository('User')).toThrow(/registered/);
    });

    it('does not hand the second application a repository from the closed configuration application', async () => {
      class Widget {}
      const first = { getRepository: jest.fn(() => ({ find: async () => ['closed'] })) };
      const find = jest.fn(async () => ['live']);
      const second = { getRepository: jest.fn(() => ({ find })) };
      const internals = PluginModule as unknown as {
        resetHostReferences(): void;
        createPluginContext(
          m: LoadedPluginManifest,
          entities: unknown[],
        ): import('@attraccess/plugins-backend-sdk').PluginContext;
      };
      new PluginModule(first, events, moduleRef);
      internals.resetHostReferences();

      const context = internals.createPluginContext(
        fixture.manifest({ permissions: [PluginPermission.DATABASE_ACCESS] }),
        [Widget],
      );
      const retained = sqlitePersistence(context).getRepository(Widget);
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

  describe('persistence.transaction', () => {
    type Internals = {
      createPluginContext(m: LoadedPluginManifest): import('@attraccess/plugins-backend-sdk').PluginContext;
    };

    it('runs the callback in a transaction of the host connection and hands the scope to the engine subpath', async () => {
      const transaction = jest.fn(async (work: (manager: unknown) => Promise<unknown>) => work('tx-manager'));
      const host = {
        manager: { connection: { options: { type: 'postgres' } }, transaction },
      };
      new PluginModule(host, new EventEmitter2(), { get: jest.fn() } as unknown as ModuleRef);
      const context = (PluginModule as unknown as Internals).createPluginContext(
        fixture.manifest({ permissions: [PluginPermission.DATABASE_ACCESS] }),
      );

      await expect(
        context.persistence.transaction(async (scope) => `ran:${String(sqlitePersistence(context).managerOf(scope))}`),
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
        fixture.manifest({ permissions: [PluginPermission.DATABASE_ACCESS] }),
      );

      await context.persistence.transaction(async (scope) => {
        scope.afterCommit(() => void order.push('after'));
        await expect(context.persistence.transaction(async () => 1)).rejects.toThrow(/inside a transaction callback/);
      });
      expect(order).toEqual(['commit', 'after']);
    });

    it('is denied without DATABASE_ACCESS', () => {
      const context = (PluginModule as unknown as Internals).createPluginContext(fixture.manifest({ permissions: [] }));
      expect(() => context.persistence).toThrow(PluginPermissionError);
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
