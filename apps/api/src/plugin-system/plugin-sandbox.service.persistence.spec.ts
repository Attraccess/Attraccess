import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PluginContext, PluginPermission, PluginPermissionError, SystemEvent } from '@attraccess/plugins-backend-sdk';
import { ModuleRef } from '@nestjs/core';
import { DataSource, EntityManager } from 'typeorm';
import { TransactionHandles } from '../database/adapters/common/transaction-handles';
import { EntityManagerResolver } from '../database/adapters/entity-manager-resolver';
import { TransactionContextResolver } from '../database/adapters/transaction-context';
import { ScopedUnitOfWork } from '../database/unit-of-work';
import { PluginSandboxService } from './plugin-sandbox.service';
import { createHostDataContext } from './runtime/host-contexts';

function buildBaseContext(events: EventEmitter2): PluginContext {
  return {
    manifest: { id: 'test-id', name: 'test-plugin', version: '1.0.0', pluginDirectory: 'test-plugin' },
    events,
    logger: new Logger('test-plugin'),
    mqtt: {
      subscribe: () => Promise.resolve({ unsubscribe: () => undefined }),
      publish: () => Promise.resolve(),
      refreshConnection: () => Promise.resolve(),
    },
    get: (token) => ({ token }) as never,
    onEvent: () => ({ off: () => undefined }),
    emitEvent: () => undefined,
    getMqttServerConfig: (serverId) =>
      Promise.resolve({
        id: serverId,
        name: 'srv',
        host: 'mqtt.example.com',
        port: 1883,
        useTls: false,
        username: 'u',
        password: 'secret',
        clientId: null,
      }),
    flows: {
      trigger: jest.fn(async () => undefined),
    },
    secrets: {
      encrypt: (value) => `encrypted:${value}`,
      decrypt: (value) => value.replace('encrypted:', ''),
    },
    getMqttCredentialProvisioning: () => ({}) as never,
    notifications: { dispatch: jest.fn(async () => undefined) },
    startBlocked: { invalidate: jest.fn() },
    resourceAccess: {
      canStart: jest.fn(async () => ({ allowed: true, requiresSupervision: false, supervisionAllowed: false })),
      canMaintain: jest.fn(async () => true),
      canSeeUsageAttribution: jest.fn(async () => true),
      hasPermission: jest.fn(async () => true),
      listResourceIdsIntroduced: jest.fn(async () => [1]),
      listResourceIdsMaintained: jest.fn(async () => [1]),
      getMaintenanceWindows: jest.fn(async () => []),
      getActiveSessions: jest.fn(async () => []),
    },
    persistence: {
      transaction: jest.fn(async (work) => work({ isOpen: true, afterCommit: () => undefined })),
    },
    storage: { open: jest.fn(() => ({}) as never) },
    hostData: {
      resources: {
        get: jest.fn(async () => null),
        getNames: jest.fn(async () => new Map()),
        filterVisible: jest.fn(async () => []),
        filterRequiringSupervision: jest.fn(async () => []),
        listIdsInGroups: jest.fn(async () => []),
        countUnhealthyEntries: jest.fn(async () => 0),
        listIntroducerUserIds: jest.fn(async () => []),
        listDisplay: jest.fn(async () => []),
      },
      users: {
        getUsernames: jest.fn(async () => new Map()),
        getLocales: jest.fn(async () => new Map()),
        isActive: jest.fn(async () => true),
        listIdsWithAnyPermission: jest.fn(async () => []),
      },
      settings: { getApp: jest.fn(async () => 'https://example.test') },
      flows: { findNodes: jest.fn(async () => []) },
    },
  };
}

describe('PluginSandboxService', () => {
  describe('validateDeclaredPermissions', () => {
    it('returns an empty array when nothing is declared', () => {
      expect(PluginSandboxService.validateDeclaredPermissions('p', undefined)).toEqual([]);
      expect(PluginSandboxService.validateDeclaredPermissions('p', null)).toEqual([]);
    });

    it('accepts and de-duplicates known permissions', () => {
      const result = PluginSandboxService.validateDeclaredPermissions('p', [
        PluginPermission.EMIT_EVENTS,
        PluginPermission.EMIT_EVENTS,
        PluginPermission.READ_USERS,
      ]);
      expect(result).toEqual([PluginPermission.EMIT_EVENTS, PluginPermission.READ_USERS]);
    });

    it('throws on an unknown permission', () => {
      expect(() => PluginSandboxService.validateDeclaredPermissions('p', ['NOT_A_PERMISSION'])).toThrow(
        /unknown permission "NOT_A_PERMISSION"/,
      );
    });

    it('throws when permissions is not an array', () => {
      expect(() => PluginSandboxService.validateDeclaredPermissions('p', 'EMIT_EVENTS')).toThrow(/must be an array/);
    });
  });

  describe('createGuardedContext', () => {
    let events: EventEmitter2;

    beforeEach(() => {
      events = new EventEmitter2();
    });

    it('passes through manifest and logger without a permission', () => {
      const ctx = PluginSandboxService.createGuardedContext(buildBaseContext(events), []);
      expect(ctx.manifest.name).toBe('test-plugin');
      expect(ctx.logger).toBeDefined();
    });

    it('throws when emitting without EMIT_EVENTS', () => {
      const ctx = PluginSandboxService.createGuardedContext(buildBaseContext(events), []);
      expect(() => ctx.events.emit('x')).toThrow(PluginPermissionError);
      expect(() => ctx.events.emit('x')).toThrow(/EMIT_EVENTS/);
    });

    it('allows emitting with EMIT_EVENTS', () => {
      const ctx = PluginSandboxService.createGuardedContext(buildBaseContext(events), [PluginPermission.EMIT_EVENTS]);
      const spy = jest.fn();
      events.on('x', spy);
      expect(() => ctx.events.emit('x', 1)).not.toThrow();
      expect(spy).toHaveBeenCalledWith(1);
    });

    it('throws when subscribing without LISTEN_EVENTS', () => {
      const ctx = PluginSandboxService.createGuardedContext(buildBaseContext(events), []);
      expect(() => ctx.events.on('x', () => undefined)).toThrow(/LISTEN_EVENTS/);
    });

    it('allows subscribing with LISTEN_EVENTS', () => {
      const ctx = PluginSandboxService.createGuardedContext(buildBaseContext(events), [PluginPermission.LISTEN_EVENTS]);
      expect(() => ctx.events.on('x', () => undefined)).not.toThrow();
    });

    it('denies event methods the sandbox does not expose', () => {
      const ctx = PluginSandboxService.createGuardedContext(buildBaseContext(events), [
        PluginPermission.EMIT_EVENTS,
        PluginPermission.LISTEN_EVENTS,
      ]);
      expect(() => (ctx.events as unknown as { removeAllListeners: () => void }).removeAllListeners()).toThrow(
        /does not expose/,
      );
      expect(() => (ctx.events as unknown as { listenTo: () => void }).listenTo()).toThrow(/does not expose/);
      expect(() => (ctx.events as unknown as { eventNames: () => void }).eventNames()).toThrow(/does not expose/);
      expect(() => (ctx.events as unknown as { constructor: unknown }).constructor).toThrow(/does not expose/);
    });

    it('does not leak the raw emitter through a this-returning method', () => {
      const ctx = PluginSandboxService.createGuardedContext(buildBaseContext(events), [PluginPermission.LISTEN_EVENTS]);
      const returned = ctx.events.on('x', () => undefined);
      expect(returned).not.toBe(events);
      // The returned reference must remain guarded: emitting through it still needs EMIT_EVENTS.
      expect(() => (returned as unknown as { emit: (e: string) => void }).emit('x')).toThrow(/EMIT_EVENTS/);
    });

    it('does not leak the raw emitter through an objectify Listener', () => {
      const ctx = PluginSandboxService.createGuardedContext(buildBaseContext(events), [PluginPermission.LISTEN_EVENTS]);
      const listener = ctx.events.on('x', () => undefined, { objectify: true }) as unknown as Record<string, unknown>;
      expect(listener.emitter).toBeUndefined();
      expect(typeof listener.off).toBe('function');
    });

    it('throws when subscribing to a SystemEvent without LISTEN_EVENTS', () => {
      const ctx = PluginSandboxService.createGuardedContext(buildBaseContext(events), []);
      expect(() => ctx.onEvent(SystemEvent.RESOURCE_USAGE_STARTED, () => null)).toThrow(/LISTEN_EVENTS/);
    });

    it('allows subscribing to a SystemEvent with LISTEN_EVENTS', () => {
      const ctx = PluginSandboxService.createGuardedContext(buildBaseContext(events), [PluginPermission.LISTEN_EVENTS]);
      expect(() => ctx.onEvent(SystemEvent.RESOURCE_USAGE_STARTED, () => null)).not.toThrow();
    });

    it('throws when emitting a SystemEvent without EMIT_EVENTS', () => {
      const ctx = PluginSandboxService.createGuardedContext(buildBaseContext(events), []);
      expect(() =>
        ctx.emitEvent(SystemEvent.RESOURCE_USAGE_ENDED, { resource: {} as never, user: {} as never }),
      ).toThrow(/EMIT_EVENTS/);
    });

    it('allows emitting a SystemEvent with EMIT_EVENTS', () => {
      const ctx = PluginSandboxService.createGuardedContext(buildBaseContext(events), [PluginPermission.EMIT_EVENTS]);
      expect(() =>
        ctx.emitEvent(SystemEvent.RESOURCE_USAGE_ENDED, { resource: {} as never, user: {} as never }),
      ).not.toThrow();
    });

    it('throws when accessing the persistence context without PLUGIN_STORAGE', () => {
      const ctx = PluginSandboxService.createGuardedContext(buildBaseContext(events), []);
      expect(() => ctx.persistence).toThrow(/PLUGIN_STORAGE/);
      const granted = PluginSandboxService.createGuardedContext(buildBaseContext(events), [
        PluginPermission.PLUGIN_STORAGE,
      ]);
      expect(typeof granted.persistence.transaction).toBe('function');
    });

    it('gates the record port behind PLUGIN_STORAGE', () => {
      const ctx = PluginSandboxService.createGuardedContext(buildBaseContext(events), []);
      expect(() => ctx.storage).toThrow(/PLUGIN_STORAGE/);
      const granted = PluginSandboxService.createGuardedContext(buildBaseContext(events), [
        PluginPermission.PLUGIN_STORAGE,
      ]);
      expect(typeof granted.storage.open).toBe('function');
    });

    it.each([
      DataSource,
      EntityManager,
      'DataSource',
      'UserRepository',
      Symbol.for('attraccess.unit-of-work'),
      Symbol.for('attraccess.database.lifecycle'),
      Symbol.for('attraccess.plugin-system.host-data'),
      TransactionHandles,
      EntityManagerResolver,
      TransactionContextResolver,
      ModuleRef,
    ])('never resolves a database handle through context.get (%p), whatever the permission', (token) => {
      const ctx = PluginSandboxService.createGuardedContext(buildBaseContext(events), Object.values(PluginPermission));
      expect(() => ctx.get(token as never)).toThrow(/database handle.*migrating-to-2/s);
    });

    it.each([
      ['a connection', () => Object.create(DataSource.prototype)],
      ['a unit of work', () => new ScopedUnitOfWork({} as never)],
    ])('refuses %s that context.get resolved under an innocent token', (_label, instance) => {
      const base = { ...buildBaseContext(events), get: () => instance() as never };
      const ctx = PluginSandboxService.createGuardedContext(base, Object.values(PluginPermission));
      expect(() => ctx.get('InnocentService')).toThrow(
        /Plugin "test-plugin" asked for a database handle \(InnocentService\)/,
      );
    });

    it('exposes no connection, repository or host entity surface on the guarded context', () => {
      const ctx = PluginSandboxService.createGuardedContext(buildBaseContext(events), Object.values(PluginPermission));
      for (const removed of ['dataSource', 'getRepository', 'runSerialized']) expect(removed in ctx).toBe(false);
    });

    it.each([
      ['resources', 'get', [1], PluginPermission.ACCESS_RESOURCES],
      ['resources', 'filterVisible', [1, [2]], PluginPermission.ACCESS_RESOURCES],
      ['users', 'getUsernames', [[1]], PluginPermission.READ_USERS],
      ['users', 'isActive', [1], PluginPermission.READ_USERS],
      ['settings', 'getApp', ['backend_url'], PluginPermission.READ_SETTINGS],
      ['flows', 'findNodes', [{ typePrefix: 'plugin.x.' }], PluginPermission.TRIGGER_FLOWS],
    ] as const)('gates hostData.%s.%s behind its permission', async (group, method, args, permission) => {
      const call = (ctx: PluginContext) =>
        (ctx.hostData[group] as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[method](...args);
      const denied = PluginSandboxService.createGuardedContext(
        buildBaseContext(events),
        Object.values(PluginPermission).filter((candidate) => candidate !== permission),
      );
      expect(() => call(denied)).toThrow(new RegExp(permission));
      const granted = PluginSandboxService.createGuardedContext(buildBaseContext(events), [permission]);
      await expect(call(granted)).resolves.not.toThrow();
    });

    // The host builds hostData as frozen objects; a guard that proxies a frozen object throws on every call.
    it('guards the frozen host hostData directories the host really builds', async () => {
      const port = { resources: { getNames: jest.fn(async () => new Map([[1, 'Laser']])) } };
      const base = {
        ...buildBaseContext(events),
        hostData: createHostDataContext({ get: () => port as never }),
      };
      const granted = PluginSandboxService.createGuardedContext(base, [PluginPermission.ACCESS_RESOURCES]);

      await expect(granted.hostData.resources.getNames([1])).resolves.toEqual(new Map([[1, 'Laser']]));
      expect(port.resources.getNames).toHaveBeenCalledWith([1]);
      expect(Object.isFrozen(granted.hostData.resources)).toBe(true);

      const denied = PluginSandboxService.createGuardedContext(base, []);
      expect(() => denied.hostData.resources.getNames([1])).toThrow(/ACCESS_RESOURCES/);
    });

    it('gates get() behind RESOLVE_HOST_PROVIDERS', () => {
      const denied = PluginSandboxService.createGuardedContext(buildBaseContext(events), []);
      expect(() => denied.get('SOME_TOKEN')).toThrow(/RESOLVE_HOST_PROVIDERS/);

      const granted = PluginSandboxService.createGuardedContext(buildBaseContext(events), [
        PluginPermission.RESOLVE_HOST_PROVIDERS,
      ]);
      expect(() => granted.get('SOME_TOKEN')).not.toThrow();
    });

    it('gates getMqttServerConfig() behind ACCESS_MQTT_SERVERS', async () => {
      const denied = PluginSandboxService.createGuardedContext(buildBaseContext(events), []);
      expect(() => denied.getMqttServerConfig(1)).toThrow(PluginPermissionError);
      expect(() => denied.getMqttServerConfig(1)).toThrow(/ACCESS_MQTT_SERVERS/);
    });

    it('gates MQTT connection refresh behind ACCESS_MQTT_SERVERS', async () => {
      const base = buildBaseContext(events);
      const refresh = jest.fn(async () => undefined);
      base.mqtt.refreshConnection = refresh;
      const denied = PluginSandboxService.createGuardedContext(base, []);
      expect(() => denied.mqtt.refreshConnection?.(1)).toThrow(PluginPermissionError);
      expect(refresh).not.toHaveBeenCalled();
      const granted = PluginSandboxService.createGuardedContext(base, [PluginPermission.ACCESS_MQTT_SERVERS]);
      await granted.mqtt.refreshConnection?.(1);
      expect(refresh).toHaveBeenCalledWith(1);
    });

    it('returns the resolved MQTT config with ACCESS_MQTT_SERVERS', async () => {
      const granted = PluginSandboxService.createGuardedContext(buildBaseContext(events), [
        PluginPermission.ACCESS_MQTT_SERVERS,
      ]);
      await expect(granted.getMqttServerConfig(7)).resolves.toMatchObject({
        id: 7,
        host: 'mqtt.example.com',
        port: 1883,
        password: 'secret',
      });
    });

    it('does not unlock getMqttServerConfig via RESOLVE_HOST_PROVIDERS', () => {
      const ctx = PluginSandboxService.createGuardedContext(buildBaseContext(events), [
        PluginPermission.RESOLVE_HOST_PROVIDERS,
      ]);
      expect(() => ctx.getMqttServerConfig(1)).toThrow(/ACCESS_MQTT_SERVERS/);
    });

    it('gates mqtt subscriptions and publishing behind ACCESS_MQTT_SERVERS', async () => {
      const denied = PluginSandboxService.createGuardedContext(buildBaseContext(events), []);
      expect(() => denied.mqtt.subscribe(1, 'sensors/+', () => undefined)).toThrow(PluginPermissionError);
      expect(() => denied.mqtt.publish(1, 'sensors/kitchen', 'on')).toThrow(PluginPermissionError);

      const granted = PluginSandboxService.createGuardedContext(buildBaseContext(events), [
        PluginPermission.ACCESS_MQTT_SERVERS,
      ]);
      await expect(granted.mqtt.subscribe(1, 'sensors/+', () => undefined)).resolves.toEqual({
        unsubscribe: expect.any(Function),
      });
      await expect(granted.mqtt.publish(1, 'sensors/kitchen', 'on')).resolves.toBeUndefined();
    });

    it('gates flows.trigger() behind TRIGGER_FLOWS', async () => {
      const base = buildBaseContext(events);
      const denied = PluginSandboxService.createGuardedContext(base, []);
      expect(() => denied.flows.trigger('plugin.test.trigger', () => true, {})).toThrow(PluginPermissionError);
      expect(() => denied.flows.trigger('plugin.test.trigger', () => true, {})).toThrow(/TRIGGER_FLOWS/);

      const granted = PluginSandboxService.createGuardedContext(base, [PluginPermission.TRIGGER_FLOWS]);
      await granted.flows.trigger('plugin.test.trigger', () => true, {});
      expect(base.flows.trigger).toHaveBeenCalledWith('plugin.test.trigger', expect.any(Function), {});
    });

    it('gates notifications.dispatch() behind SEND_NOTIFICATIONS', async () => {
      const base = buildBaseContext(events);
      const request = { category: 'c', recipients: [1], title: 't', body: 'b' };
      const denied = PluginSandboxService.createGuardedContext(base, []);
      expect(() => denied.notifications).toThrow(PluginPermissionError);
      expect(() => denied.notifications).toThrow(/SEND_NOTIFICATIONS/);

      const granted = PluginSandboxService.createGuardedContext(base, [PluginPermission.SEND_NOTIFICATIONS]);
      await granted.notifications.dispatch(request);
      expect(base.notifications.dispatch).toHaveBeenCalledWith(request);
    });

    it('gates startBlocked.invalidate() behind ACCESS_HOOKS', () => {
      const base = buildBaseContext(events);
      const denied = PluginSandboxService.createGuardedContext(base, []);
      expect(() => denied.startBlocked).toThrow(PluginPermissionError);
      expect(() => denied.startBlocked).toThrow(/ACCESS_HOOKS/);

      const granted = PluginSandboxService.createGuardedContext(base, [PluginPermission.ACCESS_HOOKS]);
      granted.startBlocked.invalidate({ resourceId: 3 });
      expect(base.startBlocked.invalidate).toHaveBeenCalledWith({ resourceId: 3 });
    });

    it('gates resourceAccess behind ACCESS_RESOURCES', async () => {
      const base = buildBaseContext(events);
      const denied = PluginSandboxService.createGuardedContext(base, []);
      expect(() => denied.resourceAccess).toThrow(/ACCESS_RESOURCES/);

      const granted = PluginSandboxService.createGuardedContext(base, [PluginPermission.ACCESS_RESOURCES]);
      await expect(granted.resourceAccess.canStart(1, 2)).resolves.toMatchObject({ allowed: true });
    });

    it('gates host-managed secret encryption behind MANAGE_SECRETS', () => {
      const denied = PluginSandboxService.createGuardedContext(buildBaseContext(events), []);
      expect(() => denied.secrets.encrypt('secret')).toThrow(/MANAGE_SECRETS/);

      const granted = PluginSandboxService.createGuardedContext(buildBaseContext(events), [
        PluginPermission.MANAGE_SECRETS,
      ]);
      expect(granted.secrets.decrypt(granted.secrets.encrypt('secret'))).toBe('secret');
    });

    it('gates ble behind BLE_TRANSPORT', () => {
      const ble = { registerProfile: jest.fn(), listReaders: jest.fn(async () => []) };
      const base = { ...buildBaseContext(events), ble } as never as PluginContext;
      const denied = PluginSandboxService.createGuardedContext(base, []);
      expect(() => denied.ble).toThrow(PluginPermissionError);
      expect(() => denied.ble).toThrow(/BLE_TRANSPORT/);

      const granted = PluginSandboxService.createGuardedContext(base, [PluginPermission.BLE_TRANSPORT]);
      expect(granted.ble).toBe(ble);
      const withoutHostSupport = PluginSandboxService.createGuardedContext(buildBaseContext(events), [
        PluginPermission.BLE_TRANSPORT,
      ]);
      expect(() => withoutHostSupport.ble).toThrow(/unavailable/);
    });

    it('gates cards behind CARD_AUTHENTICATION', () => {
      const cards = { authenticate: jest.fn() };
      const base = { ...buildBaseContext(events), cards } as never as PluginContext;
      const denied = PluginSandboxService.createGuardedContext(base, [PluginPermission.BLE_TRANSPORT]);
      expect(() => denied.cards).toThrow(PluginPermissionError);
      expect(() => denied.cards).toThrow(/CARD_AUTHENTICATION/);

      const granted = PluginSandboxService.createGuardedContext(base, [PluginPermission.CARD_AUTHENTICATION]);
      expect(granted.cards).toBe(cards);
      const withoutHostSupport = PluginSandboxService.createGuardedContext(buildBaseContext(events), [
        PluginPermission.CARD_AUTHENTICATION,
      ]);
      expect(() => withoutHostSupport.cards).toThrow(/unavailable in this host/);
    });

    it('gates readers behind READER_DEVICES', () => {
      const readers = { tap: jest.fn() };
      const base = { ...buildBaseContext(events), readers } as never as PluginContext;
      const denied = PluginSandboxService.createGuardedContext(base, [PluginPermission.CARD_AUTHENTICATION]);
      expect(() => denied.readers).toThrow(PluginPermissionError);
      expect(() => denied.readers).toThrow(/READER_DEVICES/);

      const granted = PluginSandboxService.createGuardedContext(base, [PluginPermission.READER_DEVICES]);
      expect(granted.readers).toBe(readers);
      const withoutHostSupport = PluginSandboxService.createGuardedContext(buildBaseContext(events), [
        PluginPermission.READER_DEVICES,
      ]);
      expect(() => withoutHostSupport.readers).toThrow(/unavailable in this host/);
    });

    it('gates readerUi.invalidate behind READER_UI', () => {
      const base = { ...buildBaseContext(events), readerUi: { invalidate: jest.fn() } };
      const denied = PluginSandboxService.createGuardedContext(base, []);
      expect(() => denied.readerUi.invalidate({ resourceId: 1 })).toThrow(PluginPermissionError);
      expect(() => denied.readerUi.invalidate({ resourceId: 1 })).toThrow(/READER_UI/);

      const granted = PluginSandboxService.createGuardedContext(base, [PluginPermission.READER_UI]);
      granted.readerUi.invalidate({ resourceId: 1 });
      expect(base.readerUi.invalidate).toHaveBeenCalledWith({ resourceId: 1 });
    });
  });
});
