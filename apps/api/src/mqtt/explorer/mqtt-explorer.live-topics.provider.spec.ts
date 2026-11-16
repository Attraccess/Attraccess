import { liveSubscriptionKey } from '@attraccess/shared';
import { LiveTopicsService } from '../../live-updates/live-topics.service';
import { MAX_FILTER_BYTES, MQTT_EXPLORER_PERMISSION } from './mqtt-explorer.constants';
import { MqttExplorerLiveTopicsProvider } from './mqtt-explorer.live-topics.provider';

const user = (...permissions: string[]) => ({ id: 7, effectivePermissions: new Set(permissions) }) as never;
const subscription = (mqttServerId = 1, filter = '#') => ({ topic: 'mqtt-messages' as const, mqttServerId, filter });

describe('MqttExplorerLiveTopicsProvider', () => {
  const existingServerIds = jest.fn();
  const subscribe = jest.fn();
  let registry: LiveTopicsService;
  let provider: MqttExplorerLiveTopicsProvider;

  beforeEach(() => {
    jest.resetAllMocks();
    existingServerIds.mockImplementation(async (ids: number[]) => new Set(ids.filter((id) => id < 9)));
    registry = new LiveTopicsService();
    provider = new MqttExplorerLiveTopicsProvider(registry, { existingServerIds, subscribe } as never);
    provider.onModuleInit();
  });

  it('uses the same permission as the MQTT server and flow pages, no new key', () => {
    expect(MQTT_EXPLORER_PERMISSION).toBe('resources.update');
  });

  describe('parsing', () => {
    it('accepts a typed server id and filter', () => {
      expect(registry.parse(subscription(3, 'a/+/b'))).toEqual(subscription(3, 'a/+/b'));
    });

    it('accepts a filter of exactly the byte limit and refuses one byte more', () => {
      expect(() => registry.parse(subscription(1, 'x'.repeat(MAX_FILTER_BYTES)))).not.toThrow();
      expect(() => registry.parse(subscription(1, 'x'.repeat(MAX_FILTER_BYTES + 1)))).toThrow();
      // 129 × 2 bytes: the limit counts UTF-8 bytes, not characters.
      expect(() => registry.parse(subscription(1, 'ä'.repeat(MAX_FILTER_BYTES / 2)))).not.toThrow();
      expect(() => registry.parse(subscription(1, 'ä'.repeat(MAX_FILTER_BYTES / 2 + 1)))).toThrow();
    });

    it.each([
      { topic: 'mqtt-messages', filter: '#' },
      { topic: 'mqtt-messages', mqttServerId: 0, filter: '#' },
      { topic: 'mqtt-messages', mqttServerId: 1.5, filter: '#' },
      { topic: 'mqtt-messages', mqttServerId: 1, filter: '' },
      { topic: 'mqtt-messages', mqttServerId: 1, filter: '#', identifier: 'x' },
    ])('refuses %j', (value) => {
      expect(() => registry.parse(value)).toThrow();
    });
  });

  it('keeps live subscription keys unique per server and filter', () => {
    const keys = new Set([
      liveSubscriptionKey(subscription(1, '#')),
      liveSubscriptionKey(subscription(1, 'a')),
      liveSubscriptionKey(subscription(2, '#')),
      liveSubscriptionKey({ topic: 'resource', resourceId: 1 }),
      liveSubscriptionKey({ topic: 'flow-logs', resourceId: 1 }),
    ]);
    expect(keys.size).toBe(5);
  });

  describe('authorize', () => {
    it('allows users who can edit resources', async () => {
      const rejected = await registry.authorize([subscription()], user(MQTT_EXPLORER_PERMISSION));
      expect(rejected.size).toBe(0);
    });

    it('rejects users without the permission, or without effective permissions, before looking up the server', async () => {
      expect((await registry.authorize([subscription()], user('resources.read'))).size).toBe(1);
      expect((await registry.authorize([subscription()], user())).size).toBe(1);
      expect((await registry.authorize([subscription()], { id: 7 } as never)).size).toBe(1);
      expect(existingServerIds).not.toHaveBeenCalled();
    });

    it('rejects invalid filters and unknown servers, looking every server up in one query', async () => {
      const editor = user(MQTT_EXPLORER_PERMISSION);
      const invalid = [
        subscription(1, '$share/g/#'),
        subscription(1, '$exclusive/a'),
        subscription(1, 'a/#/b'),
        subscription(1, 'a\tb'),
        subscription(9, 'a/#/b'),
      ];
      const valid = [subscription(1, 'a'), subscription(1, 'b'), subscription(2, '#'), subscription(9, '#')];
      const rejected = await registry.authorize([...invalid, ...valid], editor);
      expect([...rejected.entries()]).toEqual([
        ...invalid.map((value) => [liveSubscriptionKey(value), 'Invalid topic filter']),
        [liveSubscriptionKey(subscription(9, '#')), 'Not found'],
      ]);
      expect(existingServerIds).toHaveBeenCalledTimes(1);
      expect(existingServerIds).toHaveBeenCalledWith([1, 1, 2, 9]);
    });
  });

  it('opens the stream for the session user, never client-sent identity', async () => {
    const stream = {};
    subscribe.mockResolvedValue(stream);
    const actor = user(MQTT_EXPLORER_PERMISSION);
    await expect(registry.source(subscription(1, 'a/#'), actor)).resolves.toBe(stream);
    expect(subscribe).toHaveBeenCalledWith(actor, 1, 'a/#');
  });
});
