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
});
