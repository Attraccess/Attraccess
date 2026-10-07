import type { MqttClientServicePrivate } from './mqtt-client.service.mqtt-client-service.test-fixture';
import * as mqtt from 'mqtt';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventEmitter } from 'node:events';
import { registerMqttClientServiceFixture } from './mqtt-client.service.mqtt-client-service.test-fixture';

// Mock mqtt module thoroughly to avoid actual connections and timers
jest.mock('mqtt', () => {
  const { EventEmitter } = require('events');

  function createMockClient() {
    const emitter = new EventEmitter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client: any = {
      connected: true,
      connecting: false,
      reconnecting: false,
      on: emitter.on.bind(emitter),
      once: emitter.once.bind(emitter),
      end: jest.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      publish: jest.fn((topic: string, message: string, optsOrCb: any, cb?: any) => {
        const callback = typeof optsOrCb === 'function' ? optsOrCb : cb;
        if (typeof callback === 'function') {
          callback();
        }
      }),
      subscribe: jest.fn(
        (
          topic: string,
          optsOrCb: mqtt.IClientSubscribeOptions | ((error?: Error) => void),
          cb?: (error?: Error) => void,
        ) => {
          const callback = typeof optsOrCb === 'function' ? optsOrCb : cb;
          if (typeof callback === 'function') {
            callback();
          }
        },
      ),
      unsubscribe: jest.fn((topic: string, cb?: (error?: Error) => void) => {
        if (typeof cb === 'function') {
          cb();
        }
      }),
      emit: emitter.emit.bind(emitter),
    };
    // Simulate successful connect asynchronously
    setImmediate(() => client.emit('connect'));
    return client;
  }

  return {
    connect: jest.fn(() => createMockClient()),
  };
});
export function registerRefreshConnectionCases(fixture: ReturnType<typeof registerMqttClientServiceFixture>) {
  describe('refreshConnection', () => {
    function useRealConnections() {
      jest.restoreAllMocks();
      for (const level of ['log', 'error', 'debug', 'warn'] as const)
        jest.spyOn(Logger.prototype, level).mockImplementation(jest.fn());
      return fixture.service as unknown as MqttClientServicePrivate;
    }

    it('uses current address, credentials and TLS settings, preserving shared subscriptions and rejecting late old-client events', async () => {
      const internal = useRealConnections();
      const previous = await internal.getOrCreateClient(1);
      await fixture.service.subscribe(1, 'devices/#', 2);
      (fixture.mockRepository.findOneBy as jest.Mock).mockResolvedValue({
        ...fixture.mockServer,
        host: 'new-broker.test',
        port: 8883,
        useTls: true,
        password: 'enc:fresh-password',
        caCert: 'public-ca',
        tlsServername: 'broker.internal',
      });
      jest.mocked(mqtt.connect).mockClear();
      await fixture.service.refreshConnection(1);
      const current = internal.clients.get(1);
      expect(current).toBeDefined();
      expect(current).not.toBe(previous);
      expect(previous.end).toHaveBeenCalledWith(true);
      expect(mqtt.connect).toHaveBeenCalledWith(
        'mqtts://new-broker.test:8883',
        expect.objectContaining({
          username: 'testuser',
          password: 'fresh-password',
          ca: 'public-ca',
          servername: 'broker.internal',
        }),
      );
      expect(current?.subscribe).toHaveBeenCalledWith('devices/#', { qos: 2 }, expect.any(Function));
      jest.mocked(fixture.mockEventEmitter.emit as EventEmitter2['emit']).mockClear();
      previous.emit('connect', { cmd: 'connack', sessionPresent: false, returnCode: 0 });
      previous.emit('message', 'devices/old', Buffer.from('stale'), {
        cmd: 'publish',
        topic: 'devices/old',
        payload: Buffer.from('stale'),
        qos: 0,
        dup: false,
        retain: false,
      });
      expect(internal.clients.get(1)).toBe(current);
      expect(fixture.mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('keeps reconnecting after refresh times out and restores existing subscriptions when the broker recovers', async () => {
      const internal = useRealConnections();
      await internal.getOrCreateClient(1);
      await fixture.service.subscribe(1, 'devices/#', 2);
      const replacement = Object.assign(new EventEmitter(), {
        connected: false,
        end: jest.fn(),
        subscribe: jest.fn((_topic, _options, done) => done()),
      }) as unknown as mqtt.MqttClient;
      jest.mocked(mqtt.connect).mockReturnValueOnce(replacement);
      jest.useFakeTimers({ doNotFake: ['setImmediate'] });
      try {
        const refresh = fixture.service.refreshConnection(1);
        const failure = expect(refresh).rejects.toThrow('Timeout connecting');
        await new Promise(setImmediate);
        await jest.advanceTimersByTimeAsync(10_000);
        await failure;
        expect(fixture.mockMetricsService.mqttServersHealthy.set).toHaveBeenLastCalledWith(0);
        expect(replacement.end).not.toHaveBeenCalled();
        replacement.connected = true;
        replacement.emit('connect');
        expect(internal.clients.get(1)).toBe(replacement);
        expect(replacement.subscribe).toHaveBeenCalledWith('devices/#', { qos: 2 }, expect.any(Function));
        expect(fixture.mockMetricsService.mqttServersHealthy.set).toHaveBeenLastCalledWith(1);
      } finally {
        jest.useRealTimers();
      }
    });

    it('replaces an unreachable pending client without waiting for the previous broker and prevents it from reconnecting', async () => {
      const internal = useRealConnections();
      const previous = Object.assign(new EventEmitter(), {
        connected: false,
        end: jest.fn(),
      }) as unknown as mqtt.MqttClient;
      jest.mocked(mqtt.connect).mockReturnValueOnce(previous);
      const pending = internal.getOrCreateClient(1, true);
      const rejected = pending.catch((error) => error);
      await new Promise(setImmediate);
      (fixture.mockRepository.findOneBy as jest.Mock).mockResolvedValue({
        ...fixture.mockServer,
        host: 'new-broker.test',
      });
      await fixture.service.refreshConnection(1);
      expect((await rejected).message).toBe('MQTT connection was replaced');
      expect(previous.end).toHaveBeenCalledWith(true);
      const current = internal.clients.get(1);
      previous.emit('connect', { cmd: 'connack', sessionPresent: false, returnCode: 0 });
      expect(internal.clients.get(1)).toBe(current);
      expect(mqtt.connect).toHaveBeenLastCalledWith('mqtt://new-broker.test:1883', expect.anything());
    });
  });
}
