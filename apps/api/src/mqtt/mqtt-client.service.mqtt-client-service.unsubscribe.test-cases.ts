import type { MqttClientServicePrivate } from './mqtt-client.service.mqtt-client-service.test-fixture';
import * as mqtt from 'mqtt';
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
export function registerUnsubscribeCases(fixture: ReturnType<typeof registerMqttClientServiceFixture>) {
  describe('unsubscribe', () => {
    it('keeps a shared broker subscription until its final consumer unsubscribes', async () => {
      const mockClient = mqtt.connect({});
      (fixture.service as unknown as MqttClientServicePrivate).clients.set(1, mockClient);
      await fixture.service.subscribe(1, 'sensors/+');
      await fixture.service.subscribe(1, 'sensors/+');

      await fixture.service.unsubscribe(1, 'sensors/+');
      expect(mockClient.unsubscribe).not.toHaveBeenCalled();

      await fixture.service.unsubscribe(1, 'sensors/+');
      expect(mockClient.unsubscribe).toHaveBeenCalledWith('sensors/+', expect.any(Function));
    });

    it('lowers a shared subscription QoS when its highest-QoS consumer unsubscribes', async () => {
      const mockClient = mqtt.connect({});
      (fixture.service as unknown as MqttClientServicePrivate).clients.set(1, mockClient);
      await fixture.service.subscribe(1, 'sensors/+', 0);
      await fixture.service.subscribe(1, 'sensors/+', 2);
      (mockClient.subscribe as jest.Mock).mockClear();

      await fixture.service.unsubscribe(1, 'sensors/+', 2);

      expect(mockClient.subscribe).toHaveBeenCalledWith('sensors/+', { qos: 0 }, expect.any(Function));
      expect(
        (fixture.service as unknown as MqttClientServicePrivate).subscriptions.get(1)?.get('sensors/+')?.effectiveQos,
      ).toBe(0);
    });

    it('preserves the broker QoS when lowering the subscription is rejected', async () => {
      const mockClient = mqtt.connect({});
      (fixture.service as unknown as MqttClientServicePrivate).clients.set(1, mockClient);
      await fixture.service.subscribe(1, 'sensors/+', 0);
      await fixture.service.subscribe(1, 'sensors/+', 2);
      mockClient.subscribe = jest.fn(
        (_topic: string, _options: mqtt.IClientSubscribeOptions, callback?: (error?: Error) => void) => {
          callback?.(new Error('Subscribe error'));
        },
      );

      await expect(fixture.service.unsubscribe(1, 'sensors/+', 2)).rejects.toThrow('Subscribe error');

      expect(
        (fixture.service as unknown as MqttClientServicePrivate).subscriptions.get(1)?.get('sensors/+')?.effectiveQos,
      ).toBe(2);
    });

    it('reconciles a higher QoS subscriber added while a lower QoS update is pending', async () => {
      const mockClient = mqtt.connect({});
      (fixture.service as unknown as MqttClientServicePrivate).clients.set(1, mockClient);
      jest
        .spyOn(fixture.service as unknown as MqttClientServicePrivate, 'getOrCreateClient')
        .mockResolvedValue(mockClient);
      await fixture.service.subscribe(1, 'sensors/+', 0);
      await fixture.service.subscribe(1, 'sensors/+', 2);
      (mockClient.subscribe as jest.Mock).mockClear();

      let finishLowerQos!: () => void;
      mockClient.subscribe = jest.fn(
        (_topic: string, options: mqtt.IClientSubscribeOptions, callback?: (error?: Error) => void) => {
          if (options.qos === 0) {
            finishLowerQos = () => callback?.();
          } else {
            callback?.();
          }
        },
      );

      const lowerQos = fixture.service.unsubscribe(1, 'sensors/+', 2);
      await new Promise(setImmediate);
      const raiseQos = fixture.service.subscribe(1, 'sensors/+', 2);
      finishLowerQos();
      await Promise.all([lowerQos, raiseQos]);

      expect(mockClient.subscribe).toHaveBeenNthCalledWith(1, 'sensors/+', { qos: 0 }, expect.any(Function));
      expect(mockClient.subscribe).toHaveBeenNthCalledWith(2, 'sensors/+', { qos: 2 }, expect.any(Function));
      expect(
        (fixture.service as unknown as MqttClientServicePrivate).subscriptions.get(1)?.get('sensors/+')?.effectiveQos,
      ).toBe(2);
    });

    it('does not re-subscribe after the final consumer unsubscribes during the server lookup', async () => {
      const mockClient = mqtt.connect({});
      let resolveServerLookup!: (server: typeof fixture.mockServer) => void;
      (fixture.mockRepository.findOneBy as jest.Mock).mockImplementationOnce(
        () =>
          new Promise<typeof fixture.mockServer>((resolve) => {
            resolveServerLookup = resolve;
          }),
      );
      (fixture.service as unknown as MqttClientServicePrivate).clients.set(1, mockClient);
      (fixture.service as unknown as MqttClientServicePrivate).subscriptions.set(
        1,
        new Map([
          [
            'sensors/+',
            {
              qosCounts: new Map<0 | 1 | 2 | undefined, number>([
                [0, 1],
                [2, 1],
              ]),
              effectiveQos: 2,
            },
          ],
        ]),
      );

      const lowerQos = fixture.service.unsubscribe(1, 'sensors/+', 2);
      await new Promise(setImmediate);
      const finalUnsubscribe = fixture.service.unsubscribe(1, 'sensors/+', 0);
      resolveServerLookup(fixture.mockServer);
      await Promise.all([lowerQos, finalUnsubscribe]);

      expect(mockClient.subscribe).not.toHaveBeenCalled();
      expect(mockClient.unsubscribe).toHaveBeenCalledWith('sensors/+', expect.any(Function));
    });

    it('removes the topic from reconnect subscriptions and the active client', async () => {
      const mockClient = mqtt.connect({});
      (fixture.service as unknown as MqttClientServicePrivate).clients.set(1, mockClient);
      await fixture.service.subscribe(1, 'sensors/+');

      await fixture.service.unsubscribe(1, 'sensors/+');

      expect(mockClient.unsubscribe).toHaveBeenCalledWith('sensors/+', expect.any(Function));
    });

    it('does not subscribe after a pending connection is unsubscribed', async () => {
      const mockClient = mqtt.connect({});
      let connect!: (client: mqtt.MqttClient) => void;
      const pendingClient = new Promise<mqtt.MqttClient>((resolve) => {
        connect = resolve;
      });
      jest
        .spyOn(fixture.service as unknown as MqttClientServicePrivate, 'getOrCreateClient')
        .mockReturnValue(pendingClient);

      const subscribe = fixture.service.subscribe(1, 'sensors/+');
      await fixture.service.unsubscribe(1, 'sensors/+');
      connect(mockClient);
      await subscribe;

      expect(mockClient.subscribe).not.toHaveBeenCalled();
    });
  });
}
