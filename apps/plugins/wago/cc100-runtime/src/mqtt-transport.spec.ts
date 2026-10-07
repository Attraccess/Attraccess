import { EventEmitter } from 'node:events';
import { MqttClient } from 'mqtt';
import { MqttTransport } from './mqtt-transport';

function createClient() {
  const outgoing: MqttClient['outgoing'] = {};
  let nextMessageId = 1;
  const client = Object.assign(new EventEmitter(), {
    connected: true,
    disconnecting: false,
    outgoing,
    stream: { destroy: jest.fn() },
    publish: jest.fn((_topic: string, _payload: string, _options: unknown, callback: (error?: Error) => void) => {
      outgoing[nextMessageId++] = { volatile: false, cb: callback };
    }),
    subscribe: jest.fn((_topic: string, _options: unknown, callback: (error?: Error) => void) => {
      outgoing[nextMessageId++] = { volatile: true, cb: callback };
    }),
    removeOutgoingMessage: jest.fn((id: number) => {
      const packet = outgoing[id];
      delete outgoing[id];
      packet?.cb(new Error('Message removed'));
    }),
  });
  return client;
}

describe('MQTT transport acknowledgment recovery', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('releases measurements and heartbeat on a missing PUBACK and resumes with fresh data after reconnect', async () => {
    const client = createClient();
    const transport = new MqttTransport(client as unknown as MqttClient, jest.fn());
    const measurement = expect(transport.publish('measurements', { sequence: 1 })).rejects.toThrow('timed out');
    const heartbeat = expect(transport.publish('heartbeat', { sequence: 2 }, { retain: true })).rejects.toThrow(
      'timed out',
    );
    await jest.advanceTimersByTimeAsync(10_000);
    expect(client.stream.destroy).toHaveBeenCalledTimes(1);
    await Promise.all([measurement, heartbeat]);
    expect(client.outgoing).toEqual({});

    await expect(transport.publish('measurements', { sequence: 3 })).rejects.toThrow('unavailable');
    expect(client.publish).toHaveBeenCalledTimes(2);
    client.connected = false;
    client.emit('close');
    client.connected = true;
    client.emit('connect');
    const fresh = transport.publish('measurements', { sequence: 4 });
    const id = Number(Object.keys(client.outgoing)[0]);
    client.outgoing[id].cb(undefined as unknown as Error);
    await expect(fresh).resolves.toBeUndefined();
    expect(client.publish).toHaveBeenLastCalledWith(
      'measurements',
      JSON.stringify({ sequence: 4 }),
      { qos: 1, retain: false },
      expect.any(Function),
    );
    expect(jest.getTimerCount()).toBe(0);
  });

  it('rejects outstanding publications on socket close and removes them from MQTT retransmission storage', async () => {
    const client = createClient();
    const transport = new MqttTransport(client as unknown as MqttClient, jest.fn());
    const result = expect(transport.publish('state', { sequence: 1 })).rejects.toThrow('closed');
    client.connected = false;
    client.emit('close');
    expect(client.outgoing).toEqual({});
    await result;
    expect(jest.getTimerCount()).toBe(0);
    await expect(transport.publish('state', {})).rejects.toThrow('unavailable');
  });

  it('bounds SUBACK waits and removes failed subscription listeners before retrying', async () => {
    const client = createClient();
    const errors = jest.fn();
    const listener = jest.fn().mockRejectedValue(new Error('listener failed'));
    const transport = new MqttTransport(client as unknown as MqttClient, errors);
    const subscription = expect(transport.subscribe('commands', listener)).rejects.toThrow('timed out');
    await jest.advanceTimersByTimeAsync(10_000);
    expect(client.stream.destroy).toHaveBeenCalledTimes(1);
    await subscription;
    expect(client.listenerCount('message')).toBe(0);

    client.connected = true;
    client.emit('connect');
    const retry = transport.subscribe('commands', listener);
    const id = Number(Object.keys(client.outgoing).at(-1));
    client.outgoing[id].cb(undefined as unknown as Error);
    client.emit('message', 'commands', Buffer.from('command'));
    await retry;
    await jest.advanceTimersByTimeAsync(0);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalledWith(expect.objectContaining({ message: 'listener failed' }));
  });

  it('clears successful acknowledgment deadlines and propagates broker errors without reconnecting', async () => {
    const client = createClient();
    const transport = new MqttTransport(client as unknown as MqttClient, jest.fn());
    const published = transport.publish('heartbeat', {});
    client.outgoing[1].cb(undefined as unknown as Error);
    await published;
    const rejected = expect(transport.publish('measurements', {})).rejects.toThrow('broker rejected');
    client.outgoing[2].cb(new Error('broker rejected'));
    await rejected;
    await jest.advanceTimersByTimeAsync(20_000);
    expect(client.stream.destroy).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
});
