import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Resource, Setting, User } from '@attraccess/database-entities';
import { PluginContext, PluginPermission, PluginPermissionError, SystemEvent } from '@attraccess/plugins-backend-sdk';
import { PluginSandboxService } from './plugin-sandbox.service';

function buildBaseContext(events: EventEmitter2): PluginContext {
  const dataSource = {
    getMetadata: (entity: unknown) => {
      const aliases: Array<{ keys: unknown[]; target: unknown }> = [
        { keys: [User, 'user', 'User'], target: User },
        { keys: [Resource, 'resource', 'Resource'], target: Resource },
        { keys: [Setting, 'setting', 'Setting'], target: Setting },
      ];
      const named = entity as { name?: string };
      for (const alias of aliases) {
        if (alias.keys.includes(entity) || (named && alias.keys.includes(named.name))) {
          return { target: alias.target };
        }
      }
      throw new Error('No metadata found');
    },
  } as never;

  return {
    manifest: { id: 'test-id', name: 'test-plugin', version: '1.0.0', pluginDirectory: 'test-plugin' },
    events,
    dataSource,
    logger: new Logger('test-plugin'),
    getRepository: (entity) => ({ entity } as never),
    get: (token) => ({ token } as never),
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
        /unknown permission "NOT_A_PERMISSION"/
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
        /does not expose/
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
      expect(() => ctx.emitEvent(SystemEvent.RESOURCE_USAGE_ENDED, { resource: {} as never, user: {} as never })).toThrow(
        /EMIT_EVENTS/
      );
    });

    it('allows emitting a SystemEvent with EMIT_EVENTS', () => {
      const ctx = PluginSandboxService.createGuardedContext(buildBaseContext(events), [PluginPermission.EMIT_EVENTS]);
      expect(() =>
        ctx.emitEvent(SystemEvent.RESOURCE_USAGE_ENDED, { resource: {} as never, user: {} as never })
      ).not.toThrow();
    });

    it('throws when accessing dataSource without DATABASE_ACCESS', () => {
      const ctx = PluginSandboxService.createGuardedContext(buildBaseContext(events), []);
      expect(() => ctx.dataSource).toThrow(/DATABASE_ACCESS/);
    });

    it('gates getRepository per entity (class reference)', () => {
      const ctx = PluginSandboxService.createGuardedContext(buildBaseContext(events), [PluginPermission.READ_USERS]);
      expect(() => ctx.getRepository(User)).not.toThrow();
      expect(() => ctx.getRepository(Resource)).toThrow(/ACCESS_RESOURCES/);
      expect(() => ctx.getRepository(Setting)).toThrow(/READ_SETTINGS/);
    });

    it('resolves entity permission from TypeORM metadata for string table names', () => {
      const ctx = PluginSandboxService.createGuardedContext(buildBaseContext(events), [PluginPermission.DATABASE_ACCESS]);
      // 'user' is the table name; the guard must still require READ_USERS, not fall back to DATABASE_ACCESS.
      expect(() => ctx.getRepository('user')).toThrow(/READ_USERS/);
      expect(() => ctx.getRepository('resource')).toThrow(/ACCESS_RESOURCES/);
    });

    it('resolves entity permission from metadata for a spoofed entity object', () => {
      const ctx = PluginSandboxService.createGuardedContext(buildBaseContext(events), [PluginPermission.DATABASE_ACCESS]);
      const spoofed = { name: 'User', options: { name: 'Decoy' } } as never;
      expect(() => ctx.getRepository(spoofed)).toThrow(/READ_USERS/);
    });

    it('falls back to DATABASE_ACCESS for unmapped entities', () => {
      const granted = PluginSandboxService.createGuardedContext(buildBaseContext(events), [
        PluginPermission.DATABASE_ACCESS,
      ]);
      class SomeOtherEntity {}
      expect(() => granted.getRepository(SomeOtherEntity)).not.toThrow();

      const denied = PluginSandboxService.createGuardedContext(buildBaseContext(events), []);
      expect(() => denied.getRepository(SomeOtherEntity)).toThrow(/DATABASE_ACCESS/);
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

    it('gates flows.trigger() behind TRIGGER_FLOWS', async () => {
      const base = buildBaseContext(events);
      const denied = PluginSandboxService.createGuardedContext(base, []);
      expect(() => denied.flows.trigger('plugin.test.trigger', () => true, {})).toThrow(PluginPermissionError);
      expect(() => denied.flows.trigger('plugin.test.trigger', () => true, {})).toThrow(/TRIGGER_FLOWS/);

      const granted = PluginSandboxService.createGuardedContext(base, [PluginPermission.TRIGGER_FLOWS]);
      await granted.flows.trigger('plugin.test.trigger', () => true, {});
      expect(base.flows.trigger).toHaveBeenCalledWith('plugin.test.trigger', expect.any(Function), {});
    });
  });
});
