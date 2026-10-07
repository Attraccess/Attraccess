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
export function registerTlsOptionsCases(fixture: ReturnType<typeof registerMqttClientServiceFixture>) {
  describe('TLS options', () => {
    // Restores the real getOrCreateClient so createClient actually builds mqtt.connect options.
    const connectWith = async (serverOverrides: Partial<typeof fixture.mockServer> & Record<string, unknown>) => {
      jest.restoreAllMocks();
      jest.spyOn(Logger.prototype, 'log').mockImplementation(jest.fn());
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(jest.fn());
      (fixture.mockRepository.findOneBy as jest.Mock).mockResolvedValue({ ...fixture.mockServer, ...serverOverrides });

      await (fixture.service as unknown as MqttClientServicePrivate).getOrCreateClient(1);

      const connectMock = mqtt.connect as jest.Mock;
      return {
        url: connectMock.mock.calls.at(-1)?.[0] as string,
        options: connectMock.mock.calls.at(-1)?.[1] as mqtt.IClientOptions,
      };
    };

    it('passes CA cert, servername and rejectUnauthorized=false when TLS trust options are set', async () => {
      const { url, options } = await connectWith({
        useTls: true,
        port: 8883,
        caCert: '-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----',
        tlsServername: 'broker.example.com',
        tlsInsecure: true,
      });

      expect(url).toBe('mqtts://localhost:8883');
      expect(options.ca).toContain('BEGIN CERTIFICATE');
      expect(options.servername).toBe('broker.example.com');
      expect(options.rejectUnauthorized).toBe(false);
    });

    it('keeps default certificate verification when TLS trust options are unset', async () => {
      const { options } = await connectWith({ useTls: true, port: 8883 });

      expect(options.ca).toBeUndefined();
      expect(options.servername).toBeUndefined();
      expect(options.rejectUnauthorized).toBeUndefined();
    });

    it('ignores TLS trust options when TLS is disabled', async () => {
      const { url, options } = await connectWith({ useTls: false, caCert: 'ignored', tlsInsecure: true });

      expect(url).toBe('mqtt://localhost:1883');
      expect(options.ca).toBeUndefined();
      expect(options.rejectUnauthorized).toBeUndefined();
    });
  });
}
