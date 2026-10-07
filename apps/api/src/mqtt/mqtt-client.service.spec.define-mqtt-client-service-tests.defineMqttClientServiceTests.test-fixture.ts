import { TestingModule } from '@nestjs/testing';
import { MqttClientService } from './mqtt-client.service';
import { MqttServer } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import * as mqtt from 'mqtt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { registerMqttClientServiceShouldBeDefined } from './mqtt-client.service.mqtt-client-service-should-be-defined.test-cases';
import { registerMqttClientServiceUpdatesTheHealthyServerMetricAfterRegisteringAConnectedClient } from './mqtt-client.service.mqtt-client-service-updates-the-healthy-server-metric-after-registering-a-connected-client.test-cases';
import { resetTestFixture } from './mqtt-client.service.setup.test-fixture';
import { MqttClientServicePrivate } from './mqtt-client.service.spec.mqtt-client-service-private';
import { defineUnsubscribeTests } from './mqtt-client.service.spec.define-mqtt-client-service-tests.defineUnsubscribeTests.test-fixture';
import { defineRefreshConnectionTests } from './mqtt-client.service.spec.define-mqtt-client-service-tests.defineRefreshConnectionTests.test-fixture';
import { definePublishTests } from './mqtt-client.service.spec.define-mqtt-client-service-tests.definePublishTests.test-fixture';
import { defineSubscribeTests } from './mqtt-client.service.spec.define-mqtt-client-service-tests.defineSubscribeTests.test-fixture';
import { defineConnectionOwnershipTests } from './mqtt-client.service.spec.define-mqtt-client-service-tests.defineConnectionOwnershipTests.test-fixture';
import { defineTlsOptionsTests } from './mqtt-client.service.spec.define-mqtt-client-service-tests.defineTlsOptionsTests.test-fixture';

export function defineMqttClientServiceTests() {
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
  registerMqttClientServiceShouldBeDefined(scope);

  registerMqttClientServiceUpdatesTheHealthyServerMetricAfterRegisteringAConnectedClient(scope);

  describe('TLS options', () => {
    defineTlsOptionsTests(scope);
  });

  describe('connection ownership', () => {
    defineConnectionOwnershipTests(scope);
  });

  describe('publish', () => {
    definePublishTests(scope);
  });

  describe('subscribe', () => {
    defineSubscribeTests(scope);
  });

  describe('refreshConnection', () => {
    defineRefreshConnectionTests(scope);
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
    defineUnsubscribeTests(scope);
  });

  return scope;
}
