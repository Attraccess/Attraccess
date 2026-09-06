import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MqttClientService } from './mqtt-client.service';
import { MqttServer } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import * as mqtt from 'mqtt';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EncryptionService } from '../encryption/encryption.service';
import { MetricsService } from '../metrics/metrics.service';
import { ExternalCallTimer } from '../metrics/instrumentation/external/external.helper';

// Interface to access private members for testing
interface MqttClientServicePrivate {
  getOrCreateClient: (serverId: number, keepTryingToConnect?: boolean) => Promise<mqtt.MqttClient>;
  clients: Map<number, mqtt.MqttClient>;
  subscriptions: Map<number, Map<string, { qosCounts: Map<0 | 1 | 2 | undefined, number>; effectiveQos?: 0 | 1 | 2 }>>;
}

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

describe('MqttClientService', () => {
  let service: MqttClientService;
  let moduleRef: TestingModule;
  let mockRepository: Partial<Repository<MqttServer>>;
  let mockMetricsService: { mqttServersHealthy: { set: jest.Mock } };
  let mockExternalCallTimer: { time: jest.Mock };

  const mockServer = {
    id: 1,
    name: 'Test MQTT Server',
    host: 'localhost',
    port: 1883,
    clientId: 'test-client',
    username: 'testuser',
    password: 'testpass',
    useTls: false,
    defaultPublishQos: 0,
    defaultPublishRetain: false,
    defaultSubscribeQos: 0,
  };

  let mockEventEmitter: Partial<EventEmitter2>;

  beforeEach(async () => {
    mockRepository = {
      findOne: jest.fn(),
      findOneBy: jest.fn().mockResolvedValue(mockServer),
      update: jest.fn(),
    };

    mockEventEmitter = {
      emit: jest.fn(),
    };

    mockMetricsService = {
      mqttServersHealthy: { set: jest.fn() },
    };
    mockExternalCallTimer = {
      time: jest.fn(<T>(_target: string, _operation: string, fn: () => Promise<T>) => fn()),
    };

    moduleRef = await Test.createTestingModule({
      providers: [
        MqttClientService,
        {
          provide: getRepositoryToken(MqttServer),
          useValue: mockRepository,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
        {
          provide: EncryptionService,
          useValue: {
            isEncrypted: jest.fn((value: string) => value.startsWith('enc:')),
            encrypt: jest.fn((value: string) => `enc:${value}`),
            decrypt: jest.fn((value: string) => value.replace(/^enc:/, '')),
          },
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
        {
          provide: ExternalCallTimer,
          useValue: mockExternalCallTimer,
        },
      ],
    }).compile();

    service = moduleRef.get<MqttClientService>(MqttClientService);

    // Mock logger to prevent console output during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation(jest.fn());
    jest.spyOn(Logger.prototype, 'error').mockImplementation(jest.fn());
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(jest.fn());
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(jest.fn());

    // Mock the getOrCreateClient method to avoid actual connection attempts
    jest.spyOn(service as unknown as MqttClientServicePrivate, 'getOrCreateClient').mockResolvedValue(mqtt.connect({}));
  });

  afterEach(async () => {
    await moduleRef?.close();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('updates the healthy server metric after registering a connected client', async () => {
    // Arrange
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(jest.fn());
    jest.spyOn(Logger.prototype, 'error').mockImplementation(jest.fn());
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(jest.fn());
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(jest.fn());

    const servicePrivate = service as unknown as MqttClientServicePrivate;

    // Act
    await servicePrivate.getOrCreateClient(1);

    // Assert
    expect(servicePrivate.clients.get(1)?.connected).toBe(true);
    expect(mockMetricsService.mqttServersHealthy.set).toHaveBeenCalledWith(1);
  });

  describe('TLS options', () => {
    // Restores the real getOrCreateClient so createClient actually builds mqtt.connect options.
    const connectWith = async (serverOverrides: Partial<typeof mockServer> & Record<string, unknown>) => {
      jest.restoreAllMocks();
      jest.spyOn(Logger.prototype, 'log').mockImplementation(jest.fn());
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(jest.fn());
      (mockRepository.findOneBy as jest.Mock).mockResolvedValue({ ...mockServer, ...serverOverrides });

      await (service as unknown as MqttClientServicePrivate).getOrCreateClient(1);

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

  describe('publish', () => {
    it('should successfully publish a message', async () => {
      // Arrange - mock the internal methods to avoid actual connections
      const getOrCreateClientSpy = jest.spyOn(service as unknown as MqttClientServicePrivate, 'getOrCreateClient');
      const mockClient = mqtt.connect({});
      getOrCreateClientSpy.mockResolvedValue(mockClient);

      // Act
      await service.publish(1, 'test/topic', 'test message');

      // Assert
      expect(getOrCreateClientSpy).toHaveBeenCalledWith(1);
      expect(mockClient.publish).toHaveBeenCalled();
    }, 10000);

    it('should throw an error if publishing fails', async () => {
      // Arrange - mock the client to throw an error on publish
      const getOrCreateClientSpy = jest.spyOn(service as unknown as MqttClientServicePrivate, 'getOrCreateClient');
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
      await expect(service.publish(1, 'test/topic', 'test message')).rejects.toThrow('Publish error');
    });

    it('does not wait for the publish callback when dispatch completion is selected', async () => {
      const getOrCreateClientSpy = jest.spyOn(service as unknown as MqttClientServicePrivate, 'getOrCreateClient');
      const mockClient = mqtt.connect({});
      getOrCreateClientSpy.mockResolvedValue(mockClient);
      mockClient.publish = jest.fn();

      await expect(
        service.publish(1, 'test/topic', 'test message', undefined, { awaitAcknowledgement: false }),
      ).resolves.toBeUndefined();

      expect(mockExternalCallTimer.time).toHaveBeenCalledWith('mqtt', 'publish', expect.any(Function));
      expect(mockClient.publish).toHaveBeenCalledWith(
        'test/topic',
        'test message',
        expect.any(Object),
        expect.any(Function),
      );
    });

    it('should use server defaults when no options are provided', async () => {
      // Arrange
      (mockRepository.findOneBy as jest.Mock).mockResolvedValue({
        ...mockServer,
        defaultPublishQos: 1,
        defaultPublishRetain: true,
      });
      const getOrCreateClientSpy = jest.spyOn(service as unknown as MqttClientServicePrivate, 'getOrCreateClient');
      const mockClient = mqtt.connect({});
      getOrCreateClientSpy.mockResolvedValue(mockClient);

      // Spy on publish call args
      const publishSpy = jest.spyOn(mockClient, 'publish');

      // Act
      await service.publish(1, 'test/topic', 'test message');

      // Assert
      expect(publishSpy).toHaveBeenCalled();
      const args = (publishSpy.mock.calls[0] ?? []) as unknown[];
      const options = (args[2] ?? {}) as { qos?: number; retain?: boolean };
      expect(options.qos).toBe(1);
      expect(options.retain).toBe(true);
    });

    it('should prefer per-call options over server defaults', async () => {
      // Arrange
      (mockRepository.findOneBy as jest.Mock).mockResolvedValue({
        ...mockServer,
        defaultPublishQos: 0,
        defaultPublishRetain: true,
      });
      const getOrCreateClientSpy = jest.spyOn(service as unknown as MqttClientServicePrivate, 'getOrCreateClient');
      const mockClient = mqtt.connect({});
      getOrCreateClientSpy.mockResolvedValue(mockClient);

      const publishSpy = jest.spyOn(mockClient, 'publish');

      // Act
      await service.publish(1, 'test/topic', 'test message', { qos: 2, retain: false });

      // Assert
      expect(publishSpy).toHaveBeenCalled();
      const args = (publishSpy.mock.calls[0] ?? []) as unknown[];
      const options = (args[2] ?? {}) as { qos?: number; retain?: boolean };
      expect(options.qos).toBe(2);
      expect(options.retain).toBe(false);
    });
  });

  describe('subscribe', () => {
    it('re-subscribes tracked topics after reconnecting', async () => {
      jest.restoreAllMocks();
      jest.spyOn(Logger.prototype, 'log').mockImplementation(jest.fn());
      jest.spyOn(Logger.prototype, 'error').mockImplementation(jest.fn());
      jest.spyOn(Logger.prototype, 'debug').mockImplementation(jest.fn());
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(jest.fn());

      const servicePrivate = service as unknown as MqttClientServicePrivate;
      const client = await servicePrivate.getOrCreateClient(1);
      await service.subscribe(1, 'devices/#');
      (client.subscribe as jest.Mock).mockClear();

      client.emit('connect', { cmd: 'connack', sessionPresent: false, returnCode: 0 });

      expect(client.subscribe).toHaveBeenCalledWith('devices/#', { qos: 0 }, expect.any(Function));
    });

    it('records reconnect QoS only after the broker accepts the subscription', async () => {
      jest.restoreAllMocks();
      jest.spyOn(Logger.prototype, 'log').mockImplementation(jest.fn());
      jest.spyOn(Logger.prototype, 'error').mockImplementation(jest.fn());
      jest.spyOn(Logger.prototype, 'debug').mockImplementation(jest.fn());
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(jest.fn());

      const servicePrivate = service as unknown as MqttClientServicePrivate;
      const client = await servicePrivate.getOrCreateClient(1);
      servicePrivate.subscriptions.set(1, new Map([['devices/#', { qosCounts: new Map([[0, 1]]), effectiveQos: 2 }]]));
      jest
        .mocked(client.subscribe)
        .mockImplementation(
          (_topic: string, _options?: mqtt.IClientSubscribeOptions, callback?: (error?: Error) => void) => {
            callback?.(new Error('Subscribe error'));
            return client;
          },
        );

      client.emit('connect', { cmd: 'connack', sessionPresent: false, returnCode: 0 });

      expect(servicePrivate.subscriptions.get(1)?.get('devices/#')?.effectiveQos).toBeUndefined();
    });

    it('promotes a shared topic to the highest requested QoS', async () => {
      const mockClient = mqtt.connect({});
      jest.spyOn(service as unknown as MqttClientServicePrivate, 'getOrCreateClient').mockResolvedValue(mockClient);

      await service.subscribe(1, 'sensors/+', 0);
      (mockClient.subscribe as jest.Mock).mockClear();
      await service.subscribe(1, 'sensors/+', 2);

      expect(mockClient.subscribe).toHaveBeenCalledWith('sensors/+', { qos: 2 }, expect.any(Function));
    });

    it('retains a server default QoS that is higher than a later request', async () => {
      (mockRepository.findOneBy as jest.Mock).mockResolvedValue({ ...mockServer, defaultSubscribeQos: 2 });
      const mockClient = mqtt.connect({});
      jest.spyOn(service as unknown as MqttClientServicePrivate, 'getOrCreateClient').mockResolvedValue(mockClient);

      await service.subscribe(1, 'sensors/+');
      (mockClient.subscribe as jest.Mock).mockClear();
      await service.subscribe(1, 'sensors/+', 1);

      expect(mockClient.subscribe).not.toHaveBeenCalled();
      expect(
        (service as unknown as MqttClientServicePrivate).subscriptions.get(1)?.get('sensors/+')?.effectiveQos,
      ).toBe(2);
    });

    it('rejects acknowledgement-required subscriptions when the broker rejects them', async () => {
      const mockClient = mqtt.connect({});
      jest
        .mocked(mockClient.subscribe)
        .mockImplementation(
          (_topic: string, _options?: mqtt.IClientSubscribeOptions, callback?: (error?: Error) => void) => {
            callback?.(new Error('Subscribe error'));
            return mockClient;
          },
        );
      jest.spyOn(service as unknown as MqttClientServicePrivate, 'getOrCreateClient').mockResolvedValue(mockClient);

      await expect(service.subscribe(1, 'sensors/+', undefined, true)).rejects.toThrow('Subscribe error');
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect all clients', async () => {
      // Arrange - mock the clients map to have a client
      const mockClient = mqtt.connect({});
      (service as unknown as MqttClientServicePrivate).clients.set(1, mockClient);

      // Act
      await service.onModuleDestroy();

      // Assert
      expect(mockClient.end).toHaveBeenCalled();
    }, 10000);
  });

  describe('unsubscribe', () => {
    it('keeps a shared broker subscription until its final consumer unsubscribes', async () => {
      const mockClient = mqtt.connect({});
      (service as unknown as MqttClientServicePrivate).clients.set(1, mockClient);
      await service.subscribe(1, 'sensors/+');
      await service.subscribe(1, 'sensors/+');

      await service.unsubscribe(1, 'sensors/+');
      expect(mockClient.unsubscribe).not.toHaveBeenCalled();

      await service.unsubscribe(1, 'sensors/+');
      expect(mockClient.unsubscribe).toHaveBeenCalledWith('sensors/+', expect.any(Function));
    });

    it('lowers a shared subscription QoS when its highest-QoS consumer unsubscribes', async () => {
      const mockClient = mqtt.connect({});
      (service as unknown as MqttClientServicePrivate).clients.set(1, mockClient);
      await service.subscribe(1, 'sensors/+', 0);
      await service.subscribe(1, 'sensors/+', 2);
      (mockClient.subscribe as jest.Mock).mockClear();

      await service.unsubscribe(1, 'sensors/+', 2);

      expect(mockClient.subscribe).toHaveBeenCalledWith('sensors/+', { qos: 0 }, expect.any(Function));
      expect(
        (service as unknown as MqttClientServicePrivate).subscriptions.get(1)?.get('sensors/+')?.effectiveQos,
      ).toBe(0);
    });

    it('preserves the broker QoS when lowering the subscription is rejected', async () => {
      const mockClient = mqtt.connect({});
      (service as unknown as MqttClientServicePrivate).clients.set(1, mockClient);
      await service.subscribe(1, 'sensors/+', 0);
      await service.subscribe(1, 'sensors/+', 2);
      jest
        .mocked(mockClient.subscribe)
        .mockImplementation(
          (_topic: string, _options?: mqtt.IClientSubscribeOptions, callback?: (error?: Error) => void) => {
            callback?.(new Error('Subscribe error'));
            return mockClient;
          },
        );

      await expect(service.unsubscribe(1, 'sensors/+', 2)).rejects.toThrow('Subscribe error');

      expect(
        (service as unknown as MqttClientServicePrivate).subscriptions.get(1)?.get('sensors/+')?.effectiveQos,
      ).toBe(2);
    });

    it('reconciles a higher QoS subscriber added while a lower QoS update is pending', async () => {
      const mockClient = mqtt.connect({});
      (service as unknown as MqttClientServicePrivate).clients.set(1, mockClient);
      jest.spyOn(service as unknown as MqttClientServicePrivate, 'getOrCreateClient').mockResolvedValue(mockClient);
      await service.subscribe(1, 'sensors/+', 0);
      await service.subscribe(1, 'sensors/+', 2);
      (mockClient.subscribe as jest.Mock).mockClear();

      let finishLowerQos!: () => void;
      jest
        .mocked(mockClient.subscribe)
        .mockImplementation(
          (_topic: string, options?: mqtt.IClientSubscribeOptions, callback?: (error?: Error) => void) => {
            if (options?.qos === 0) {
              finishLowerQos = () => callback?.();
            } else {
              callback?.();
            }
            return mockClient;
          },
        );

      const lowerQos = service.unsubscribe(1, 'sensors/+', 2);
      await new Promise(setImmediate);
      const raiseQos = service.subscribe(1, 'sensors/+', 2);
      finishLowerQos();
      await Promise.all([lowerQos, raiseQos]);

      expect(mockClient.subscribe).toHaveBeenNthCalledWith(1, 'sensors/+', { qos: 0 }, expect.any(Function));
      expect(mockClient.subscribe).toHaveBeenNthCalledWith(2, 'sensors/+', { qos: 2 }, expect.any(Function));
      expect(
        (service as unknown as MqttClientServicePrivate).subscriptions.get(1)?.get('sensors/+')?.effectiveQos,
      ).toBe(2);
    });

    it('does not re-subscribe after the final consumer unsubscribes during the server lookup', async () => {
      const mockClient = mqtt.connect({});
      let resolveServerLookup!: (server: typeof mockServer) => void;
      (mockRepository.findOneBy as jest.Mock).mockImplementationOnce(
        () =>
          new Promise<typeof mockServer>((resolve) => {
            resolveServerLookup = resolve;
          }),
      );
      (service as unknown as MqttClientServicePrivate).clients.set(1, mockClient);
      (service as unknown as MqttClientServicePrivate).subscriptions.set(
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

      const lowerQos = service.unsubscribe(1, 'sensors/+', 2);
      await new Promise(setImmediate);
      const finalUnsubscribe = service.unsubscribe(1, 'sensors/+', 0);
      resolveServerLookup(mockServer);
      await Promise.all([lowerQos, finalUnsubscribe]);

      expect(mockClient.subscribe).not.toHaveBeenCalled();
      expect(mockClient.unsubscribe).toHaveBeenCalledWith('sensors/+', expect.any(Function));
    });

    it('removes the topic from reconnect subscriptions and the active client', async () => {
      const mockClient = mqtt.connect({});
      (service as unknown as MqttClientServicePrivate).clients.set(1, mockClient);
      await service.subscribe(1, 'sensors/+');

      await service.unsubscribe(1, 'sensors/+');

      expect(mockClient.unsubscribe).toHaveBeenCalledWith('sensors/+', expect.any(Function));
    });

    it('does not subscribe after a pending connection is unsubscribed', async () => {
      const mockClient = mqtt.connect({});
      let connect!: (client: mqtt.MqttClient) => void;
      const pendingClient = new Promise<mqtt.MqttClient>((resolve) => {
        connect = resolve;
      });
      jest.spyOn(service as unknown as MqttClientServicePrivate, 'getOrCreateClient').mockReturnValue(pendingClient);

      const subscribe = service.subscribe(1, 'sensors/+');
      await service.unsubscribe(1, 'sensors/+');
      connect(mockClient);
      await subscribe;

      expect(mockClient.subscribe).not.toHaveBeenCalled();
    });
  });
});
