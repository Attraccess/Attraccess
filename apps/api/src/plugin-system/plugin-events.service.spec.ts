import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Resource, User } from '@attraccess/database-entities';
import { PluginContext, PluginPermission, SystemEvent, SystemEventPayload } from '@attraccess/plugins-backend-sdk';
import { PluginSandboxService } from './plugin-sandbox.service';
import { PluginEventsService } from './plugin-events.service';

function buildPayload(): { resource: Resource; user: User } {
  return { resource: { id: 1, name: 'CNC' } as Resource, user: { id: 7 } as User };
}

describe('PluginEventsService', () => {
  let events: EventEmitter2;
  let service: PluginEventsService;

  beforeEach(() => {
    events = new EventEmitter2();
    service = new PluginEventsService(events);
  });

  it('delivers a typed payload from emit to a subscribed handler', () => {
    const handler = jest.fn();
    service.onEvent(SystemEvent.RESOURCE_USAGE_STARTED, handler);

    const payload = buildPayload();
    service.emit(SystemEvent.RESOURCE_USAGE_STARTED, payload);

    expect(handler).toHaveBeenCalledWith(payload);
  });

  it('namespaces events so distinct SystemEvents do not cross-fire', () => {
    const started = jest.fn();
    const ended = jest.fn();
    service.onEvent(SystemEvent.RESOURCE_USAGE_STARTED, started);
    service.onEvent(SystemEvent.RESOURCE_USAGE_ENDED, ended);

    service.emit(SystemEvent.RESOURCE_USAGE_ENDED, buildPayload());

    expect(ended).toHaveBeenCalledTimes(1);
    expect(started).not.toHaveBeenCalled();
  });

  it('detaches a handler when off() is called', () => {
    const handler = jest.fn();
    const subscription = service.onEvent(SystemEvent.RESOURCE_USAGE_STARTED, handler);
    subscription.off();

    service.emit(SystemEvent.RESOURCE_USAGE_STARTED, buildPayload());

    expect(handler).not.toHaveBeenCalled();
  });

  it('isolates a throwing handler so emit never throws into the core flow', () => {
    jest
      .spyOn((service as unknown as { logger: { error: () => void } }).logger, 'error')
      .mockImplementation(() => undefined);
    service.onEvent(SystemEvent.RESOURCE_USAGE_STARTED, () => {
      throw new Error('plugin blew up');
    });

    expect(() => service.emit(SystemEvent.RESOURCE_USAGE_STARTED, buildPayload())).not.toThrow();
  });
});

function baseContext(events: EventEmitter2, name: string): PluginContext {
  return {
    manifest: { id: name, name, version: '1.0.0', pluginDirectory: name },
    events,
    dataSource: {} as never,
    logger: new Logger(name),
    getRepository: (() => ({})) as never,
    get: (() => ({})) as never,
    onEvent: () => ({ off: () => undefined }),
    emitEvent: () => undefined,
    getMqttServerConfig: () => Promise.resolve(null),
    mqtt: { subscribe: async () => ({ unsubscribe: () => undefined }), publish: async () => undefined },
    getMqttCredentialProvisioning: () => {
      throw new Error('Unused fixture provisioning');
    },
    flows: { trigger: async () => undefined },
    secrets: { encrypt: (value) => value, decrypt: (value) => value },
  };
}

function guarded(events: EventEmitter2, name: string, permissions: PluginPermission[]): PluginContext {
  return PluginSandboxService.createGuardedContext(baseContext(events, name), permissions);
}

const BOTH = [PluginPermission.EMIT_EVENTS, PluginPermission.LISTEN_EVENTS];

describe('Plugin event bus (typed emit/subscribe through the guarded context)', () => {
  let events: EventEmitter2;

  beforeEach(() => {
    events = new EventEmitter2();
  });

  it('delivers a host-emitted system event to a subscribed plugin with its payload intact', () => {
    const plugin = guarded(events, 'listener-plugin', [PluginPermission.LISTEN_EVENTS]);
    const received: SystemEventPayload[SystemEvent.RESOURCE_USAGE_STARTED][] = [];
    plugin.events.on(SystemEvent.RESOURCE_USAGE_STARTED, (payload) => received.push(payload));

    const payload = { resource: { id: 7 } as Resource, user: { id: 3 } as User };
    events.emit(SystemEvent.RESOURCE_USAGE_STARTED, payload);

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(payload);
  });

  it('round-trips an event emitted by one plugin to another plugin on the shared bus', () => {
    const emitter = guarded(events, 'emitter-plugin', [PluginPermission.EMIT_EVENTS]);
    const subscriber = guarded(events, 'subscriber-plugin', [PluginPermission.LISTEN_EVENTS]);

    const spy = jest.fn();
    subscriber.events.on('plugin.custom.event', spy);
    emitter.events.emit('plugin.custom.event', { value: 42 });

    expect(spy).toHaveBeenCalledWith({ value: 42 });
  });

  it('collects listener responses through emitAsync', async () => {
    events.on('ask', () => 'answer-a');
    events.on('ask', () => 'answer-b');
    const plugin = guarded(events, 'asker', [PluginPermission.EMIT_EVENTS]);

    await expect(plugin.events.emitAsync('ask')).resolves.toEqual(['answer-a', 'answer-b']);
  });

  it('fires a once subscription exactly one time', () => {
    const plugin = guarded(events, 'once-plugin', BOTH);
    const spy = jest.fn();
    plugin.events.once('ping', spy);

    plugin.events.emit('ping');
    plugin.events.emit('ping');

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('resolves waitFor with the emitted arguments', async () => {
    const plugin = guarded(events, 'waiter', BOTH);
    const pending = plugin.events.waitFor('later');
    plugin.events.emit('later', 'payload');
    await expect(pending).resolves.toEqual(['payload']);
  });

  it('denies emitting without EMIT_EVENTS and subscribing without LISTEN_EVENTS', () => {
    const listenOnly = guarded(events, 'listen-only', [PluginPermission.LISTEN_EVENTS]);
    expect(() => listenOnly.events.emit('x')).toThrow(/EMIT_EVENTS/);

    const emitOnly = guarded(events, 'emit-only', [PluginPermission.EMIT_EVENTS]);
    expect(() => emitOnly.events.on('x', () => undefined)).toThrow(/LISTEN_EVENTS/);
  });

  it('removes a listener through off so later emits are not delivered', () => {
    const plugin = guarded(events, 'off-plugin', BOTH);
    const spy = jest.fn();
    plugin.events.on('toggle', spy);
    plugin.events.emit('toggle');
    plugin.events.off('toggle', spy);
    plugin.events.emit('toggle');

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
