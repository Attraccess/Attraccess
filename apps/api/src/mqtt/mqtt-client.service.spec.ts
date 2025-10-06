import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MqttClientService } from './mqtt-client.service';
import { MqttServer } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import * as mqtt from 'mqtt';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

// Interface to access private members for testing
interface MqttClientServicePrivate {
  getOrCreateClient: (serverId: number) => Promise<mqtt.MqttClient>;
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

  const mockServer = {
    id: 1,
    name: 'Test MQTT Server',
    host: 'localhost',
    port: 1883,
    clientId: 'test-client',
    username: 'testuser',
    password: 'testpass',
    useTls: false,
  };

  let mockEventEmitter: Partial<EventEmitter2>;

  beforeEach(async () => {
    mockRepository = {
      findOne: jest.fn(),
      findOneBy: jest.fn().mockResolvedValue(mockServer),
    };

    mockEventEmitter = {
      emit: jest.fn(),
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
