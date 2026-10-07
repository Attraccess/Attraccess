import { MqttServer } from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as mqtt from 'mqtt';
import { Repository } from 'typeorm';
import { EncryptionService } from '../encryption/encryption.service';
import { ExternalCallTimer } from '../metrics/instrumentation/external/external.helper';
import { MetricsService } from '../metrics/metrics.service';
import { MqttClientService } from './mqtt-client.service';

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

// Interface to access private members for testing
export interface MqttClientServicePrivate {
  getOrCreateClient: (serverId: number, keepTryingToConnect?: boolean) => Promise<mqtt.MqttClient>;
  clients: Map<number, mqtt.MqttClient>;
  subscriptions: Map<number, Map<string, { qosCounts: Map<0 | 1 | 2 | undefined, number>; effectiveQos?: 0 | 1 | 2 }>>;
}
export function registerMqttClientServiceFixture() {
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
  return {
    get service() {
      return service;
    },
    get mockRepository() {
      return mockRepository;
    },
    get mockMetricsService() {
      return mockMetricsService;
    },
    get mockExternalCallTimer() {
      return mockExternalCallTimer;
    },
    get mockServer() {
      return mockServer;
    },
    get mockEventEmitter() {
      return mockEventEmitter;
    },
  };
}
