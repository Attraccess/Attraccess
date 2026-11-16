import { liveSubscriptionKey } from './live-updates';

describe('liveSubscriptionKey', () => {
  it('keys resource topics by topic and resource id', () => {
    expect(liveSubscriptionKey({ topic: 'resource', resourceId: 3 })).toBe('resource:3');
    expect(liveSubscriptionKey({ topic: 'flow-logs', resourceId: 3 })).toBe('flow-logs:3');
  });

  it('keys user topics by topic alone', () => {
    expect(liveSubscriptionKey({ topic: 'billing' })).toBe('billing:');
  });

  it('keys plugin topics by identifier, treating a missing identifier as empty', () => {
    expect(liveSubscriptionKey({ topic: 'plugin:a:b', identifier: 'x' })).toBe('["plugin:a:b","x"]');
    expect(liveSubscriptionKey({ topic: 'plugin:a:b' })).toBe('["plugin:a:b",""]');
  });

  it('keys MQTT message topics by server and filter, so they never collide', () => {
    const keys = [
      liveSubscriptionKey({ topic: 'mqtt-messages', mqttServerId: 1, filter: '#' }),
      liveSubscriptionKey({ topic: 'mqtt-messages', mqttServerId: 1, filter: 'a/#' }),
      liveSubscriptionKey({ topic: 'mqtt-messages', mqttServerId: 2, filter: '#' }),
      // A filter that looks like part of another key.
      liveSubscriptionKey({ topic: 'mqtt-messages', mqttServerId: 1, filter: '#",2,"x' }),
    ];
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys[0]).toBe('["mqtt-messages",1,"#"]');
  });
});
