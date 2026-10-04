import type { AuthenticatedUser, PluginLiveTopic } from '@attraccess/plugins-backend-sdk';
import { liveSubscriptionKey } from '@attraccess/shared';
import { Subject } from 'rxjs';
import { LiveTopicsService } from '../live-updates/live-topics.service';
import { LiveUpdatesService } from '../live-updates/live-updates.service';
import { SseInstrumentation } from '../metrics/instrumentation/sse/sse.helper';
import { PluginLiveUpdatesService } from './plugin-live-updates.service';

const user = { id: 1, jwtTokenId: 'session-1' } as AuthenticatedUser;
const id = '00000000-0000-0000-0000-000000000001';

function setup() {
  const registry = new LiveTopicsService();
  const plugins = new PluginLiveUpdatesService(registry);
  const source = new Subject<{ data: object }>();
  const definition: PluginLiveTopic = {
    topic: 'status',
    identifier: 'required',
    authorize: jest.fn(({ identifier }, authenticated) => {
      if (identifier !== 'device:1' || authenticated.id !== 1) throw new Error('secret rejection detail');
    }),
    source: jest.fn(() => source),
  };
  return { registry, plugins, source, definition };
}

describe('plugin live-update SDK host bridge', () => {
  it('namespaces topics, validates identifiers/fields and requires explicit authorization', () => {
    const { registry, plugins, definition } = setup();
    plugins.register('a', 'alpha', definition);
    plugins.register('b', 'beta', definition);
    expect(registry.parse({ topic: 'plugin:alpha:status', identifier: 'device:1' })).toEqual({
      topic: 'plugin:alpha:status',
      identifier: 'device:1',
    });
    for (const value of [
      { topic: 'status', identifier: 'device:1' },
      { topic: 'plugin:alpha:status' },
      { topic: 'plugin:alpha:status', identifier: '' },
      { topic: 'plugin:alpha:status', identifier: 1 },
      { topic: 'plugin:alpha:status', identifier: 'x'.repeat(129) },
      { topic: 'plugin:alpha:status', identifier: 'device:1', userId: 2 },
      { topic: 'plugin:alpha:status', identifier: 'device:1', resourceId: 1 },
    ])
      expect(() => registry.parse(value)).toThrow();
    expect(() => plugins.register('a', 'alpha', definition)).toThrow('already registered');
    expect(() => plugins.register('a', 'alpha', { ...definition, topic: 'beta:status' })).toThrow('Invalid');
    expect(() =>
      plugins.register('a', 'alpha', {
        ...definition,
        authorize: undefined as unknown as PluginLiveTopic['authorize'],
      }),
    ).toThrow('Invalid');
  });

  it('isolates plugins, users and identifiers; unregister stops active sources without affecting another plugin', async () => {
    const { registry, plugins, definition, source } = setup();
    const unregister = plugins.register('a', 'alpha', definition);
    plugins.register('b', 'beta', { ...definition, identifier: 'none' });
    const subscription = registry.parse({ topic: 'plugin:alpha:status', identifier: 'device:1' });
    expect((await registry.authorize([subscription], user)).size).toBe(0);
    expect((await registry.authorize([subscription], { ...user, id: 2 })).get(liveSubscriptionKey(subscription))).toBe(
      'Plugin topic forbidden or unavailable',
    );
    const complete = jest.fn(),
      receive = jest.fn();
    (await registry.source(subscription, user)).subscribe({ next: receive, complete });
    source.next({ data: { value: 1 } });
    expect(definition.source).toHaveBeenCalledWith({ topic: 'status', identifier: 'device:1' }, user);
    unregister();
    unregister();
    plugins.clearPlugin('a');
    expect(complete).toHaveBeenCalledTimes(1);
    expect(source.observed).toBe(false);
    expect(() => registry.parse(subscription)).toThrow('Unsupported');
    expect(registry.parse({ topic: 'plugin:beta:status' })).toEqual({ topic: 'plugin:beta:status' });
    plugins.onModuleDestroy();
    expect(() => registry.parse({ topic: 'plugin:beta:status' })).toThrow('Unsupported');
  });

  it('mixed bundled subscriptions retain authorized delivery and revoke plugin sources on renewal', async () => {
    const { registry, plugins, definition, source } = setup();
    plugins.register('a', 'alpha', definition);
    const core = new Subject<{ data: object }>();
    registry.register({ topics: [{ topic: 'billing', scope: 'user' }], source: () => core });
    const transport = new LiveUpdatesService(registry, { wrapTopic: (_topic, stream) => stream } as SseInstrumentation);
    const packets: Array<{ data: unknown }> = [];
    const connection = transport.open(id, user).subscribe((packet) => packets.push(packet));
    const good = { topic: 'plugin:alpha:status', identifier: 'device:1' };
    await transport.update(id, user, {
      revision: 1,
      subscriptions: [good, { ...good, identifier: 'device:2' }, { topic: 'billing' }],
    });
    source.next({ data: { eventType: 'changed', value: 7 } });
    expect(packets).toContainEqual({
      data: { type: 'event', event: { ...good, eventType: 'changed', payload: { eventType: 'changed', value: 7 } } },
    });
    expect(source.observed).toBe(true);
    jest.mocked(definition.authorize).mockImplementation(() => {
      throw new Error('revoked');
    });
    await transport.update(id, user, { revision: 1, subscriptions: [good, { topic: 'billing' }] });
    expect(source.observed).toBe(false);
    expect(core.observed).toBe(true);
    connection.unsubscribe();
    expect(core.observed).toBe(false);
  });
});
