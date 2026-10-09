import { MqttServer } from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TestingModule } from '@nestjs/testing';
import * as mqtt from 'mqtt';
import { EventEmitter } from 'node:events';
import { Repository } from 'typeorm';
import { inheritTestScope } from './../test-utils/inherit-test-scope';
import { MqttClientService } from './mqtt-client.service';
import { resetTestFixture } from './mqtt-client.service.setup.test-fixture';
import { MqttClientServicePrivate } from './mqtt-client.service.spec.mqtt-client-service-private';

// Interface to access private members for testing
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
      removeListener: emitter.removeListener.bind(emitter),
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
  const scope = {
    get service() {
      return service;
    },
    set service(value: typeof service) {
      service = value;
    },
    get mockMetricsService() {
      return mockMetricsService;
    },
    set mockMetricsService(value: typeof mockMetricsService) {
      mockMetricsService = value;
    },
    get moduleRef() {
      return moduleRef;
    },
    set moduleRef(value: typeof moduleRef) {
      moduleRef = value;
    },
    get mockRepository() {
      return mockRepository;
    },
    set mockRepository(value: typeof mockRepository) {
      mockRepository = value;
    },
    get mockExternalCallTimer() {
      return mockExternalCallTimer;
    },
    set mockExternalCallTimer(value: typeof mockExternalCallTimer) {
      mockExternalCallTimer = value;
    },
    get mockServer() {
      return mockServer;
    },
    get mockEventEmitter() {
      return mockEventEmitter;
    },
    set mockEventEmitter(value: typeof mockEventEmitter) {
      mockEventEmitter = value;
    },
  };

  beforeEach(async () => {
    await resetTestFixture(scope);
  });

  afterEach(async () => {
    await moduleRef?.close();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(scope.service).toBeDefined();
  });

  it('updates the healthy server metric after registering a connected client', async () => {
    // Arrange
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(jest.fn());
    jest.spyOn(Logger.prototype, 'error').mockImplementation(jest.fn());
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(jest.fn());
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(jest.fn());

    const servicePrivate = scope.service as unknown as MqttClientServicePrivate;

    // Act
    await servicePrivate.getOrCreateClient(1);

    // Assert
    expect(servicePrivate.clients.get(1)?.connected).toBe(true);
    expect(scope.mockMetricsService.mqttServersHealthy.set).toHaveBeenCalledWith(1);
  });

  describe('TLS options', () => {
    // Restores the real getOrCreateClient so createClient actually builds mqtt.connect options.
    const tlsOptionsScope = inheritTestScope(
      {
        get connectWith() {
          return connectWith;
        },
      },
      scope,
    );
    const connectWith = async (serverOverrides: Partial<typeof scope.mockServer> & Record<string, unknown>) => {
      jest.restoreAllMocks();
      jest.spyOn(Logger.prototype, 'log').mockImplementation(jest.fn());
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(jest.fn());
      (scope.mockRepository.findOneBy as jest.Mock).mockResolvedValue({
        ...scope.mockServer,
        ...serverOverrides,
      });

      await (scope.service as unknown as MqttClientServicePrivate).getOrCreateClient(1);

      const connectMock = mqtt.connect as jest.Mock;
      return {
        url: connectMock.mock.calls.at(-1)?.[0] as string,
        options: connectMock.mock.calls.at(-1)?.[1] as mqtt.IClientOptions,
      };
    };

    it('passes CA cert, servername and rejectUnauthorized=false when TLS trust options are set', async () => {
      const { url, options } = await tlsOptionsScope.connectWith({
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
      const { options } = await tlsOptionsScope.connectWith({ useTls: true, port: 8883 });

      expect(options.ca).toBeUndefined();
      expect(options.servername).toBeUndefined();
      expect(options.rejectUnauthorized).toBeUndefined();
    });

    it('ignores TLS trust options when TLS is disabled', async () => {
      const { url, options } = await tlsOptionsScope.connectWith({
        useTls: false,
        caCert: 'ignored',
        tlsInsecure: true,
      });

      expect(url).toBe('mqtt://localhost:1883');
      expect(options.ca).toBeUndefined();
      expect(options.rejectUnauthorized).toBeUndefined();
    });
  });

  describe('connection ownership', () => {
    const connectionOwnershipScope = inheritTestScope(
      {
        get service() {
          return scope.service;
        },
        set service(value: typeof scope.service) {
          scope.service = value;
        },
      },
      scope,
    );

    beforeEach(() => {
      jest.restoreAllMocks();
      jest.spyOn(Logger.prototype, 'log').mockImplementation(jest.fn());
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(jest.fn());
      jest.spyOn(Logger.prototype, 'debug').mockImplementation(jest.fn());
      jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    });

    afterEach(() => jest.useRealTimers());

    it('shares the reconnecting client between concurrent callers instead of creating a duplicate identity', async () => {
      const internal = connectionOwnershipScope.service as unknown as MqttClientServicePrivate;
      const client = await internal.getOrCreateClient(1);
      client.connected = false;
      client.emit('offline');
      (mqtt.connect as jest.Mock).mockClear();

      const first = internal.getOrCreateClient(1);
      const second = internal.getOrCreateClient(1);
      client.connected = true;
      client.emit('connect');

      await expect(first).resolves.toBe(client);
      await expect(second).resolves.toBe(client);
      expect(mqtt.connect).not.toHaveBeenCalled();
      expect(client.end).not.toHaveBeenCalled();
    });

    it('bounds reconnect waits without replacing or stopping the client', async () => {
      const internal = connectionOwnershipScope.service as unknown as MqttClientServicePrivate;
      const client = await internal.getOrCreateClient(1);
      client.connected = false;
      (mqtt.connect as jest.Mock).mockClear();

      const waiting = expect(internal.getOrCreateClient(1)).rejects.toThrow('Timeout');
      await jest.advanceTimersByTimeAsync(10_000);
      await waiting;
      expect(mqtt.connect).not.toHaveBeenCalled();
      expect(client.end).not.toHaveBeenCalled();

      const retry = internal.getOrCreateClient(1);
      client.connected = true;
      client.emit('connect');
      await expect(retry).resolves.toBe(client);
    });

    it('retains a failed refresh connection for later callers while it continues reconnecting', async () => {
      const unreachable = Object.assign(new EventEmitter(), { connected: false, end: jest.fn() });
      (mqtt.connect as jest.Mock).mockImplementationOnce(() => unreachable);
      const refresh = expect(connectionOwnershipScope.service.refreshConnection(1)).rejects.toThrow('Timeout');
      await jest.advanceTimersByTimeAsync(10_000);
      await refresh;
      (mqtt.connect as jest.Mock).mockClear();

      const retry = (connectionOwnershipScope.service as unknown as MqttClientServicePrivate).getOrCreateClient(1);
      unreachable.connected = true;
      unreachable.emit('connect');
      await expect(retry).resolves.toBe(unreachable);
      expect(mqtt.connect).not.toHaveBeenCalled();
    });

    it('rejects a reconnect waiter when refreshing and ignores late events from the retired client', async () => {
      const internal = connectionOwnershipScope.service as unknown as MqttClientServicePrivate;
      const previous = await internal.getOrCreateClient(1);
      previous.connected = false;
      const waiting = expect(internal.getOrCreateClient(1)).rejects.toThrow('replaced');

      await connectionOwnershipScope.service.refreshConnection(1);
      await waiting;
      const replacement = internal.clients.get(1);
      previous.connected = true;
      previous.emit('connect');
      expect(internal.clients.get(1)).toBe(replacement);
      expect(previous.end).toHaveBeenCalledWith(true);
    });
  });

  describe('publish', () => {
    const publishScope = inheritTestScope(
      {
        get service() {
          return scope.service;
        },
        set service(value: typeof scope.service) {
          scope.service = value;
        },
        get mockExternalCallTimer() {
          return scope.mockExternalCallTimer;
        },
        set mockExternalCallTimer(value: typeof scope.mockExternalCallTimer) {
          scope.mockExternalCallTimer = value;
        },
        get mockRepository() {
          return scope.mockRepository;
        },
        set mockRepository(value: typeof scope.mockRepository) {
          scope.mockRepository = value;
        },
        get mockServer() {
          return scope.mockServer;
        },
      },
      scope,
    );

    it('should successfully publish a message', async () => {
      // Arrange - mock the internal methods to avoid actual connections
      const getOrCreateClientSpy = jest.spyOn(
        publishScope.service as unknown as MqttClientServicePrivate,
        'getOrCreateClient',
      );
      const mockClient = mqtt.connect({});
      getOrCreateClientSpy.mockResolvedValue(mockClient);

      // Act
      await publishScope.service.publish(1, 'test/topic', 'test message');

      // Assert
      expect(getOrCreateClientSpy).toHaveBeenCalledWith(1);
      expect(mockClient.publish).toHaveBeenCalled();
    }, 10000);

    it('should throw an error if publishing fails', async () => {
      // Arrange - mock the client to throw an error on publish
      const getOrCreateClientSpy = jest.spyOn(
        publishScope.service as unknown as MqttClientServicePrivate,
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
      await expect(publishScope.service.publish(1, 'test/topic', 'test message')).rejects.toThrow('Publish error');
    });

    it('does not wait for the publish callback when dispatch completion is selected', async () => {
      const getOrCreateClientSpy = jest.spyOn(
        publishScope.service as unknown as MqttClientServicePrivate,
        'getOrCreateClient',
      );
      const mockClient = mqtt.connect({});
      getOrCreateClientSpy.mockResolvedValue(mockClient);
      mockClient.publish = jest.fn();

      await expect(
        publishScope.service.publish(1, 'test/topic', 'test message', undefined, { awaitAcknowledgement: false }),
      ).resolves.toBeUndefined();

      expect(publishScope.mockExternalCallTimer.time).toHaveBeenCalledWith('mqtt', 'publish', expect.any(Function));
      expect(mockClient.publish).toHaveBeenCalledWith(
        'test/topic',
        'test message',
        expect.any(Object),
        expect.any(Function),
      );
    });

    it('should use server defaults when no options are provided', async () => {
      // Arrange
      (publishScope.mockRepository.findOneBy as jest.Mock).mockResolvedValue({
        ...publishScope.mockServer,
        defaultPublishQos: 1,
        defaultPublishRetain: true,
      });
      const getOrCreateClientSpy = jest.spyOn(
        publishScope.service as unknown as MqttClientServicePrivate,
        'getOrCreateClient',
      );
      const mockClient = mqtt.connect({});
      getOrCreateClientSpy.mockResolvedValue(mockClient);

      // Spy on publish call args
      const publishSpy = jest.spyOn(mockClient, 'publish');

      // Act
      await publishScope.service.publish(1, 'test/topic', 'test message');

      // Assert
      expect(publishSpy).toHaveBeenCalled();
      const args = (publishSpy.mock.calls[0] ?? []) as unknown[];
      const options = (args[2] ?? {}) as { qos?: number; retain?: boolean };
      expect(options.qos).toBe(1);
      expect(options.retain).toBe(true);
    });

    it('should prefer per-call options over server defaults', async () => {
      // Arrange
      (publishScope.mockRepository.findOneBy as jest.Mock).mockResolvedValue({
        ...publishScope.mockServer,
        defaultPublishQos: 0,
        defaultPublishRetain: true,
      });
      const getOrCreateClientSpy = jest.spyOn(
        publishScope.service as unknown as MqttClientServicePrivate,
        'getOrCreateClient',
      );
      const mockClient = mqtt.connect({});
      getOrCreateClientSpy.mockResolvedValue(mockClient);

      const publishSpy = jest.spyOn(mockClient, 'publish');

      // Act
      await publishScope.service.publish(1, 'test/topic', 'test message', { qos: 2, retain: false });

      // Assert
      expect(publishSpy).toHaveBeenCalled();
      const args = (publishSpy.mock.calls[0] ?? []) as unknown[];
      const options = (args[2] ?? {}) as { qos?: number; retain?: boolean };
      expect(options.qos).toBe(2);
      expect(options.retain).toBe(false);
    });
  });

  describe('subscribe', () => {
    const subscribeScope = inheritTestScope(
      {
        get service() {
          return scope.service;
        },
        set service(value: typeof scope.service) {
          scope.service = value;
        },
        get mockRepository() {
          return scope.mockRepository;
        },
        set mockRepository(value: typeof scope.mockRepository) {
          scope.mockRepository = value;
        },
        get mockServer() {
          return scope.mockServer;
        },
      },
      scope,
    );

    it('re-subscribes tracked topics after reconnecting', async () => {
      jest.restoreAllMocks();
      jest.spyOn(Logger.prototype, 'log').mockImplementation(jest.fn());
      jest.spyOn(Logger.prototype, 'error').mockImplementation(jest.fn());
      jest.spyOn(Logger.prototype, 'debug').mockImplementation(jest.fn());
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(jest.fn());

      const servicePrivate = subscribeScope.service as unknown as MqttClientServicePrivate;
      const client = await servicePrivate.getOrCreateClient(1);
      await subscribeScope.service.subscribe(1, 'devices/#');
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

      const servicePrivate = subscribeScope.service as unknown as MqttClientServicePrivate;
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
        .spyOn(subscribeScope.service as unknown as MqttClientServicePrivate, 'getOrCreateClient')
        .mockResolvedValue(mockClient);

      await subscribeScope.service.subscribe(1, 'sensors/+', 0);
      (mockClient.subscribe as jest.Mock).mockClear();
      await subscribeScope.service.subscribe(1, 'sensors/+', 2);

      expect(mockClient.subscribe).toHaveBeenCalledWith('sensors/+', { qos: 2 }, expect.any(Function));
    });

    it('retains a server default QoS that is higher than a later request', async () => {
      (subscribeScope.mockRepository.findOneBy as jest.Mock).mockResolvedValue({
        ...subscribeScope.mockServer,
        defaultSubscribeQos: 2,
      });
      const mockClient = mqtt.connect({});
      jest
        .spyOn(subscribeScope.service as unknown as MqttClientServicePrivate, 'getOrCreateClient')
        .mockResolvedValue(mockClient);

      await subscribeScope.service.subscribe(1, 'sensors/+');
      (mockClient.subscribe as jest.Mock).mockClear();
      await subscribeScope.service.subscribe(1, 'sensors/+', 1);

      expect(mockClient.subscribe).not.toHaveBeenCalled();
      expect(
        (subscribeScope.service as unknown as MqttClientServicePrivate).subscriptions.get(1)?.get('sensors/+')
          ?.effectiveQos,
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
        .spyOn(subscribeScope.service as unknown as MqttClientServicePrivate, 'getOrCreateClient')
        .mockResolvedValue(mockClient);

      await expect(subscribeScope.service.subscribe(1, 'sensors/+', undefined, true)).rejects.toThrow(
        'Subscribe error',
      );
    });
  });

  describe('refreshConnection', () => {
    function useRealConnections() {
      jest.restoreAllMocks();
      for (const level of ['log', 'error', 'debug', 'warn'] as const)
        jest.spyOn(Logger.prototype, level).mockImplementation(jest.fn());
      return scope.service as unknown as MqttClientServicePrivate;
    }
    const refreshConnectionScope = inheritTestScope(
      {
        get useRealConnections() {
          return useRealConnections;
        },
        get service() {
          return scope.service;
        },
        set service(value: typeof scope.service) {
          scope.service = value;
        },
        get mockRepository() {
          return scope.mockRepository;
        },
        set mockRepository(value: typeof scope.mockRepository) {
          scope.mockRepository = value;
        },
        get mockServer() {
          return scope.mockServer;
        },
        get mockEventEmitter() {
          return scope.mockEventEmitter;
        },
        set mockEventEmitter(value: typeof scope.mockEventEmitter) {
          scope.mockEventEmitter = value;
        },
        get mockMetricsService() {
          return scope.mockMetricsService;
        },
        set mockMetricsService(value: typeof scope.mockMetricsService) {
          scope.mockMetricsService = value;
        },
      },
      scope,
    );

    it('uses current address, credentials and TLS settings, preserving shared subscriptions and rejecting late old-client events', async () => {
      const internal = refreshConnectionScope.useRealConnections();
      const previous = await internal.getOrCreateClient(1);
      await refreshConnectionScope.service.subscribe(1, 'devices/#', 2);
      (refreshConnectionScope.mockRepository.findOneBy as jest.Mock).mockResolvedValue({
        ...refreshConnectionScope.mockServer,
        host: 'new-broker.test',
        port: 8883,
        useTls: true,
        password: 'enc:fresh-password',
        caCert: 'public-ca',
        tlsServername: 'broker.internal',
      });
      jest.mocked(mqtt.connect).mockClear();
      await refreshConnectionScope.service.refreshConnection(1);
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
      jest.mocked(refreshConnectionScope.mockEventEmitter.emit as EventEmitter2['emit']).mockClear();
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
      expect(refreshConnectionScope.mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('keeps reconnecting after refresh times out and restores existing subscriptions when the broker recovers', async () => {
      const internal = refreshConnectionScope.useRealConnections();
      await internal.getOrCreateClient(1);
      await refreshConnectionScope.service.subscribe(1, 'devices/#', 2);
      const replacement = Object.assign(new EventEmitter(), {
        connected: false,
        end: jest.fn(),
        subscribe: jest.fn((_topic, _options, done) => done()),
      }) as unknown as mqtt.MqttClient;
      jest.mocked(mqtt.connect).mockReturnValueOnce(replacement);
      jest.useFakeTimers({ doNotFake: ['setImmediate'] });
      try {
        const refresh = refreshConnectionScope.service.refreshConnection(1);
        const failure = expect(refresh).rejects.toThrow('Timeout connecting');
        await new Promise(setImmediate);
        await jest.advanceTimersByTimeAsync(10_000);
        await failure;
        expect(refreshConnectionScope.mockMetricsService.mqttServersHealthy.set).toHaveBeenLastCalledWith(0);
        expect(replacement.end).not.toHaveBeenCalled();
        replacement.connected = true;
        replacement.emit('connect');
        expect(internal.clients.get(1)).toBe(replacement);
        expect(replacement.subscribe).toHaveBeenCalledWith('devices/#', { qos: 2 }, expect.any(Function));
        expect(refreshConnectionScope.mockMetricsService.mqttServersHealthy.set).toHaveBeenLastCalledWith(1);
      } finally {
        jest.useRealTimers();
      }
    });

    it('replaces an unreachable pending client without waiting for the previous broker and prevents it from reconnecting', async () => {
      const internal = refreshConnectionScope.useRealConnections();
      const previous = Object.assign(new EventEmitter(), {
        connected: false,
        end: jest.fn(),
      }) as unknown as mqtt.MqttClient;
      jest.mocked(mqtt.connect).mockReturnValueOnce(previous);
      const pending = internal.getOrCreateClient(1, true);
      const rejected = pending.catch((error) => error);
      await new Promise(setImmediate);
      (refreshConnectionScope.mockRepository.findOneBy as jest.Mock).mockResolvedValue({
        ...refreshConnectionScope.mockServer,
        host: 'new-broker.test',
      });
      await refreshConnectionScope.service.refreshConnection(1);
      expect((await rejected).message).toBe('MQTT connection was replaced');
      expect(previous.end).toHaveBeenCalledWith(true);
      const current = internal.clients.get(1);
      previous.emit('connect', { cmd: 'connack', sessionPresent: false, returnCode: 0 });
      expect(internal.clients.get(1)).toBe(current);
      expect(mqtt.connect).toHaveBeenLastCalledWith('mqtt://new-broker.test:1883', expect.anything());
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
    const unsubscribeScope = inheritTestScope(
      {
        get service() {
          return scope.service;
        },
        set service(value: typeof scope.service) {
          scope.service = value;
        },
        get mockServer() {
          return scope.mockServer;
        },
        get mockRepository() {
          return scope.mockRepository;
        },
        set mockRepository(value: typeof scope.mockRepository) {
          scope.mockRepository = value;
        },
      },
      scope,
    );

    it('keeps a shared broker subscription until its final consumer unsubscribes', async () => {
      const mockClient = mqtt.connect({});
      (unsubscribeScope.service as unknown as MqttClientServicePrivate).clients.set(1, mockClient);
      await unsubscribeScope.service.subscribe(1, 'sensors/+');
      await unsubscribeScope.service.subscribe(1, 'sensors/+');

      await unsubscribeScope.service.unsubscribe(1, 'sensors/+');
      expect(mockClient.unsubscribe).not.toHaveBeenCalled();

      await unsubscribeScope.service.unsubscribe(1, 'sensors/+');
      expect(mockClient.unsubscribe).toHaveBeenCalledWith('sensors/+', expect.any(Function));
    });

    it('lowers a shared subscription QoS when its highest-QoS consumer unsubscribes', async () => {
      const mockClient = mqtt.connect({});
      (unsubscribeScope.service as unknown as MqttClientServicePrivate).clients.set(1, mockClient);
      await unsubscribeScope.service.subscribe(1, 'sensors/+', 0);
      await unsubscribeScope.service.subscribe(1, 'sensors/+', 2);
      (mockClient.subscribe as jest.Mock).mockClear();

      await unsubscribeScope.service.unsubscribe(1, 'sensors/+', 2);

      expect(mockClient.subscribe).toHaveBeenCalledWith('sensors/+', { qos: 0 }, expect.any(Function));
      expect(
        (unsubscribeScope.service as unknown as MqttClientServicePrivate).subscriptions.get(1)?.get('sensors/+')
          ?.effectiveQos,
      ).toBe(0);
    });

    it('preserves the broker QoS when lowering the subscription is rejected', async () => {
      const mockClient = mqtt.connect({});
      (unsubscribeScope.service as unknown as MqttClientServicePrivate).clients.set(1, mockClient);
      await unsubscribeScope.service.subscribe(1, 'sensors/+', 0);
      await unsubscribeScope.service.subscribe(1, 'sensors/+', 2);
      mockClient.subscribe = jest.fn(
        (_topic: string, _options: mqtt.IClientSubscribeOptions, callback?: (error?: Error) => void) => {
          callback?.(new Error('Subscribe error'));
        },
      );

      await expect(unsubscribeScope.service.unsubscribe(1, 'sensors/+', 2)).rejects.toThrow('Subscribe error');

      expect(
        (unsubscribeScope.service as unknown as MqttClientServicePrivate).subscriptions.get(1)?.get('sensors/+')
          ?.effectiveQos,
      ).toBe(2);
    });

    it('reconciles a higher QoS subscriber added while a lower QoS update is pending', async () => {
      const mockClient = mqtt.connect({});
      (unsubscribeScope.service as unknown as MqttClientServicePrivate).clients.set(1, mockClient);
      jest
        .spyOn(unsubscribeScope.service as unknown as MqttClientServicePrivate, 'getOrCreateClient')
        .mockResolvedValue(mockClient);
      await unsubscribeScope.service.subscribe(1, 'sensors/+', 0);
      await unsubscribeScope.service.subscribe(1, 'sensors/+', 2);
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

      const lowerQos = unsubscribeScope.service.unsubscribe(1, 'sensors/+', 2);
      await new Promise(setImmediate);
      const raiseQos = unsubscribeScope.service.subscribe(1, 'sensors/+', 2);
      finishLowerQos();
      await Promise.all([lowerQos, raiseQos]);

      expect(mockClient.subscribe).toHaveBeenNthCalledWith(1, 'sensors/+', { qos: 0 }, expect.any(Function));
      expect(mockClient.subscribe).toHaveBeenNthCalledWith(2, 'sensors/+', { qos: 2 }, expect.any(Function));
      expect(
        (unsubscribeScope.service as unknown as MqttClientServicePrivate).subscriptions.get(1)?.get('sensors/+')
          ?.effectiveQos,
      ).toBe(2);
    });

    it('does not re-subscribe after the final consumer unsubscribes during the server lookup', async () => {
      const mockClient = mqtt.connect({});
      let resolveServerLookup!: (server: typeof unsubscribeScope.mockServer) => void;
      (unsubscribeScope.mockRepository.findOneBy as jest.Mock).mockImplementationOnce(
        () =>
          new Promise<typeof unsubscribeScope.mockServer>((resolve) => {
            resolveServerLookup = resolve;
          }),
      );
      (unsubscribeScope.service as unknown as MqttClientServicePrivate).clients.set(1, mockClient);
      (unsubscribeScope.service as unknown as MqttClientServicePrivate).subscriptions.set(
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

      const lowerQos = unsubscribeScope.service.unsubscribe(1, 'sensors/+', 2);
      await new Promise(setImmediate);
      const finalUnsubscribe = unsubscribeScope.service.unsubscribe(1, 'sensors/+', 0);
      resolveServerLookup(unsubscribeScope.mockServer);
      await Promise.all([lowerQos, finalUnsubscribe]);

      expect(mockClient.subscribe).not.toHaveBeenCalled();
      expect(mockClient.unsubscribe).toHaveBeenCalledWith('sensors/+', expect.any(Function));
    });

    it('removes the topic from reconnect subscriptions and the active client', async () => {
      const mockClient = mqtt.connect({});
      (unsubscribeScope.service as unknown as MqttClientServicePrivate).clients.set(1, mockClient);
      await unsubscribeScope.service.subscribe(1, 'sensors/+');

      await unsubscribeScope.service.unsubscribe(1, 'sensors/+');

      expect(mockClient.unsubscribe).toHaveBeenCalledWith('sensors/+', expect.any(Function));
    });

    it('does not subscribe after a pending connection is unsubscribed', async () => {
      const mockClient = mqtt.connect({});
      let connect!: (client: mqtt.MqttClient) => void;
      const pendingClient = new Promise<mqtt.MqttClient>((resolve) => {
        connect = resolve;
      });
      jest
        .spyOn(unsubscribeScope.service as unknown as MqttClientServicePrivate, 'getOrCreateClient')
        .mockReturnValue(pendingClient);

      const subscribe = unsubscribeScope.service.subscribe(1, 'sensors/+');
      await unsubscribeScope.service.unsubscribe(1, 'sensors/+');
      connect(mockClient);
      await subscribe;

      expect(mockClient.subscribe).not.toHaveBeenCalled();
    });
  });
});
export { MqttClientServicePrivate } from './mqtt-client.service.spec.mqtt-client-service-private';

export type MqttClientServiceTestScope = {
  service: MqttClientService;
  mockMetricsService: { mqttServersHealthy: { set: jest.Mock } };
  moduleRef: TestingModule;
  mockRepository: Partial<Repository<MqttServer>>;
  mockExternalCallTimer: { time: jest.Mock };
  mockServer: {
    id: number;
    name: string;
    host: string;
    port: number;
    clientId: string;
    username: string;
    password: string;
    useTls: boolean;
    defaultPublishQos: number;
    defaultPublishRetain: boolean;
    defaultSubscribeQos: number;
  };
  mockEventEmitter: Partial<EventEmitter2>;
};
