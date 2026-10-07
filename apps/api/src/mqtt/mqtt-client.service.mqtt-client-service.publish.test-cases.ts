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
export function registerPublishCases(fixture: ReturnType<typeof registerMqttClientServiceFixture>) {
  describe('publish', () => {
    it('should successfully publish a message', async () => {
      // Arrange - mock the internal methods to avoid actual connections
      const getOrCreateClientSpy = jest.spyOn(
        fixture.service as unknown as MqttClientServicePrivate,
        'getOrCreateClient',
      );
      const mockClient = mqtt.connect({});
      getOrCreateClientSpy.mockResolvedValue(mockClient);

      // Act
      await fixture.service.publish(1, 'test/topic', 'test message');

      // Assert
      expect(getOrCreateClientSpy).toHaveBeenCalledWith(1);
      expect(mockClient.publish).toHaveBeenCalled();
    }, 10000);

    it('should throw an error if publishing fails', async () => {
      // Arrange - mock the client to throw an error on publish
      const getOrCreateClientSpy = jest.spyOn(
        fixture.service as unknown as MqttClientServicePrivate,
        'getOrCreateClient',
      );
      const mockClient = mqtt.connect({});
      getOrCreateClientSpy.mockResolvedValue(mockClient);

      // Make publish callback throw an error
      mockClient.publish = jest
        .fn()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementation((topic: string, message: string, optionsOrCb?: any, cb?: (err?: Error) => void) => {
          const callback = typeof optionsOrCb === 'function' ? optionsOrCb : cb;
          if (typeof callback === 'function') {
            callback(new Error('Publish error'));
          }
        });

      // Act & Assert
      await expect(fixture.service.publish(1, 'test/topic', 'test message')).rejects.toThrow('Publish error');
    });

    it('does not wait for the publish callback when dispatch completion is selected', async () => {
      const getOrCreateClientSpy = jest.spyOn(
        fixture.service as unknown as MqttClientServicePrivate,
        'getOrCreateClient',
      );
      const mockClient = mqtt.connect({});
      getOrCreateClientSpy.mockResolvedValue(mockClient);
      mockClient.publish = jest.fn();

      await expect(
        fixture.service.publish(1, 'test/topic', 'test message', undefined, { awaitAcknowledgement: false }),
      ).resolves.toBeUndefined();

      expect(fixture.mockExternalCallTimer.time).toHaveBeenCalledWith('mqtt', 'publish', expect.any(Function));
      expect(mockClient.publish).toHaveBeenCalledWith(
        'test/topic',
        'test message',
        expect.any(Object),
        expect.any(Function),
      );
    });

    it('should use server defaults when no options are provided', async () => {
      // Arrange
      (fixture.mockRepository.findOneBy as jest.Mock).mockResolvedValue({
        ...fixture.mockServer,
        defaultPublishQos: 1,
        defaultPublishRetain: true,
      });
      const getOrCreateClientSpy = jest.spyOn(
        fixture.service as unknown as MqttClientServicePrivate,
        'getOrCreateClient',
      );
      const mockClient = mqtt.connect({});
      getOrCreateClientSpy.mockResolvedValue(mockClient);

      // Spy on publish call args
      const publishSpy = jest.spyOn(mockClient, 'publish');

      // Act
      await fixture.service.publish(1, 'test/topic', 'test message');

      // Assert
      expect(publishSpy).toHaveBeenCalled();
      const args = (publishSpy.mock.calls[0] ?? []) as unknown[];
      const options = (args[2] ?? {}) as { qos?: number; retain?: boolean };
      expect(options.qos).toBe(1);
      expect(options.retain).toBe(true);
    });

    it('should prefer per-call options over server defaults', async () => {
      // Arrange
      (fixture.mockRepository.findOneBy as jest.Mock).mockResolvedValue({
        ...fixture.mockServer,
        defaultPublishQos: 0,
        defaultPublishRetain: true,
      });
      const getOrCreateClientSpy = jest.spyOn(
        fixture.service as unknown as MqttClientServicePrivate,
        'getOrCreateClient',
      );
      const mockClient = mqtt.connect({});
      getOrCreateClientSpy.mockResolvedValue(mockClient);

      const publishSpy = jest.spyOn(mockClient, 'publish');

      // Act
      await fixture.service.publish(1, 'test/topic', 'test message', { qos: 2, retain: false });

      // Assert
      expect(publishSpy).toHaveBeenCalled();
      const args = (publishSpy.mock.calls[0] ?? []) as unknown[];
      const options = (args[2] ?? {}) as { qos?: number; retain?: boolean };
      expect(options.qos).toBe(2);
      expect(options.retain).toBe(false);
    });
  });
}
