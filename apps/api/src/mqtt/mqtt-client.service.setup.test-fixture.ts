import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MqttClientService } from './mqtt-client.service';
import { MqttServer } from '@attraccess/database-entities';
import * as mqtt from 'mqtt';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EncryptionService } from '../encryption/encryption.service';
import { MetricsService } from '../metrics/metrics.service';
import { ExternalCallTimer } from '../metrics/instrumentation/external/external.helper';
import { MqttClientServiceTestScope } from './mqtt-client.service.spec';
import { MqttClientServicePrivate } from './mqtt-client.service.spec.mqtt-client-service-private';

export async function resetTestFixture(scope: MqttClientServiceTestScope) {
  scope.mockRepository = {
    findOne: jest.fn(),
    findOneBy: jest.fn().mockResolvedValue(scope.mockServer),
    update: jest.fn(),
  };

  scope.mockEventEmitter = {
    emit: jest.fn(),
  };

  scope.mockMetricsService = {
    mqttServersHealthy: { set: jest.fn() },
  };
  scope.mockExternalCallTimer = {
    time: jest.fn(<T>(_target: string, _operation: string, fn: () => Promise<T>) => fn()),
  };

  scope.moduleRef = await Test.createTestingModule({
    providers: [
      MqttClientService,
      {
        provide: getRepositoryToken(MqttServer),
        useValue: scope.mockRepository,
      },
      {
        provide: EventEmitter2,
        useValue: scope.mockEventEmitter,
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
        useValue: scope.mockMetricsService,
      },
      {
        provide: ExternalCallTimer,
        useValue: scope.mockExternalCallTimer,
      },
    ],
  }).compile();

  scope.service = scope.moduleRef.get<MqttClientService>(MqttClientService);

  // Mock logger to prevent console output during tests
  jest.spyOn(Logger.prototype, 'log').mockImplementation(jest.fn());
  jest.spyOn(Logger.prototype, 'error').mockImplementation(jest.fn());
  jest.spyOn(Logger.prototype, 'debug').mockImplementation(jest.fn());
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(jest.fn());

  // Mock the getOrCreateClient method to avoid actual connection attempts
  jest
    .spyOn(scope.service as unknown as MqttClientServicePrivate, 'getOrCreateClient')
    .mockResolvedValue(mqtt.connect({}));
}
