import type { MqttClientServicePrivate } from './mqtt-client.service.mqtt-client-service.test-fixture';
import * as mqtt from 'mqtt';
import { Logger } from '@nestjs/common';
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
export function registerSubscribeCases(fixture: ReturnType<typeof registerMqttClientServiceFixture>) {
  describe('subscribe', () => {
    it('re-subscribes tracked topics after reconnecting', async () => {
      jest.restoreAllMocks();
      jest.spyOn(Logger.prototype, 'log').mockImplementation(jest.fn());
      jest.spyOn(Logger.prototype, 'error').mockImplementation(jest.fn());
      jest.spyOn(Logger.prototype, 'debug').mockImplementation(jest.fn());
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(jest.fn());

      const servicePrivate = fixture.service as unknown as MqttClientServicePrivate;
      const client = await servicePrivate.getOrCreateClient(1);
      await fixture.service.subscribe(1, 'devices/#');
      (client.subscribe as jest.Mock).mockClear();

      client.emit('connect');

      expect(client.subscribe).toHaveBeenCalledWith('devices/#', { qos: 0 }, expect.any(Function));
    });

    it('records reconnect QoS only after the broker accepts the subscription', async () => {
      jest.restoreAllMocks();
      jest.spyOn(Logger.prototype, 'log').mockImplementation(jest.fn());
      jest.spyOn(Logger.prototype, 'error').mockImplementation(jest.fn());
      jest.spyOn(Logger.prototype, 'debug').mockImplementation(jest.fn());
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(jest.fn());

      const servicePrivate = fixture.service as unknown as MqttClientServicePrivate;
      const client = await servicePrivate.getOrCreateClient(1);
      servicePrivate.subscriptions.set(1, new Map([['devices/#', { qosCounts: new Map([[0, 1]]), effectiveQos: 2 }]]));
      client.subscribe = jest.fn(
        (_topic: string, _options: mqtt.IClientSubscribeOptions, callback?: (error?: Error) => void) => {
          callback?.(new Error('Subscribe error'));
        },
      );

      client.emit('connect');

      expect(servicePrivate.subscriptions.get(1)?.get('devices/#')?.effectiveQos).toBeUndefined();
    });

    it('promotes a shared topic to the highest requested QoS', async () => {
      const mockClient = mqtt.connect({});
      jest
        .spyOn(fixture.service as unknown as MqttClientServicePrivate, 'getOrCreateClient')
        .mockResolvedValue(mockClient);

      await fixture.service.subscribe(1, 'sensors/+', 0);
      (mockClient.subscribe as jest.Mock).mockClear();
      await fixture.service.subscribe(1, 'sensors/+', 2);

      expect(mockClient.subscribe).toHaveBeenCalledWith('sensors/+', { qos: 2 }, expect.any(Function));
    });

    it('retains a server default QoS that is higher than a later request', async () => {
      (fixture.mockRepository.findOneBy as jest.Mock).mockResolvedValue({
        ...fixture.mockServer,
        defaultSubscribeQos: 2,
      });
      const mockClient = mqtt.connect({});
      jest
        .spyOn(fixture.service as unknown as MqttClientServicePrivate, 'getOrCreateClient')
        .mockResolvedValue(mockClient);

      await fixture.service.subscribe(1, 'sensors/+');
      (mockClient.subscribe as jest.Mock).mockClear();
      await fixture.service.subscribe(1, 'sensors/+', 1);

      expect(mockClient.subscribe).not.toHaveBeenCalled();
      expect(
        (fixture.service as unknown as MqttClientServicePrivate).subscriptions.get(1)?.get('sensors/+')?.effectiveQos,
      ).toBe(2);
    });

    it('rejects acknowledgement-required subscriptions when the broker rejects them', async () => {
      const mockClient = mqtt.connect({});
      mockClient.subscribe = jest.fn(
        (_topic: string, _options: mqtt.IClientSubscribeOptions, callback?: (error?: Error) => void) => {
          callback?.(new Error('Subscribe error'));
        },
      );
      jest
        .spyOn(fixture.service as unknown as MqttClientServicePrivate, 'getOrCreateClient')
        .mockResolvedValue(mockClient);

      await expect(fixture.service.subscribe(1, 'sensors/+', undefined, true)).rejects.toThrow('Subscribe error');
    });
  });
}
