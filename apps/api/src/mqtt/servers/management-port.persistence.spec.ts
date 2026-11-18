import 'reflect-metadata';
import { instanceToPlain } from 'class-transformer';
import { DataSource, Repository } from 'typeorm';
import { MqttServer } from '@attraccess/database-entities';
import type { EncryptionService } from '../../encryption/encryption.service';
import type { MetricsService } from '../../metrics/metrics.service';
import { TypeOrmMqttServerStore } from '../../database/adapters/mqtt/typeorm-mqtt-server.store';
import { MqttServerService } from './mqtt-server.service';
import { createTestDataSource, closeTestDataSource } from '../../test-utils/test-database';

const ACTOR = { id: 1, authenticationMethod: 'session' as const };
const audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };

jest.mock('../../encryption/encryption.service', () => ({ EncryptionService: class {} }));
jest.mock('../../metrics/metrics.service', () => ({ MetricsService: class {} }));

describe('MQTT managementPort persistence and service', () => {
  let dataSource: DataSource;
  let repository: Repository<MqttServer>;
  let service: MqttServerService;
  const encryption = {
    encrypt: jest.fn((value: string) => `fixture:${value}`),
    decryptIfEncrypted: jest.fn((value: string) => value.replace(/^fixture:/, '')),
  };
  const metrics = { mqttServersTotal: { inc: jest.fn(), dec: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    dataSource = await createTestDataSource();
    repository = dataSource.getRepository(MqttServer);
    service = new MqttServerService(
      new TypeOrmMqttServerStore(repository),
      encryption as unknown as EncryptionService,
      metrics as unknown as MetricsService,
      { emit: jest.fn() } as never,
      audit as never,
    );
  });

  afterEach(async () => {
    await closeTestDataSource(dataSource);
  });

  it.each([
    { label: 'minimum', input: { managementPort: 1 }, expected: 1 },
    { label: 'custom', input: { managementPort: 25671 }, expected: 25671 },
    { label: 'maximum', input: { managementPort: 65535 }, expected: 65535 },
    { label: 'null', input: { managementPort: null }, expected: null },
    { label: 'omitted', input: {}, expected: null },
  ])('creates, reloads and serializes $label managementPort', async ({ input, expected }) => {
    const created = await service.create(
      {
        name: 'Fixture',
        host: 'broker.invalid',
        port: 28883,
        password: 'test-password',
        ...input,
      },
      ACTOR,
    );
    const loaded = await repository.findOneByOrFail({ id: created.id });

    expect(created.managementPort).toBe(expected);
    expect(loaded).toBeInstanceOf(MqttServer);
    expect(loaded.managementPort).toBe(expected);
    expect(loaded.port).toBe(28883);
    expect(loaded.password).toBe('fixture:test-password');
    expect(instanceToPlain(loaded)).toMatchObject({ managementPort: expected, port: 28883 });
    expect(instanceToPlain(loaded)).not.toHaveProperty('password');
    expect(encryption.encrypt).toHaveBeenCalledWith('test-password');
    expect(metrics.mqttServersTotal.inc).toHaveBeenCalledTimes(1);
  });

  it.each([
    { label: 'minimum', update: { managementPort: 1 }, expected: 1 },
    { label: 'custom', update: { managementPort: 35672 }, expected: 35672 },
    { label: 'maximum', update: { managementPort: 65535 }, expected: 65535 },
    { label: 'omission preserves', update: { name: 'Renamed fixture' }, expected: 25671 },
    { label: 'null clears', update: { managementPort: null }, expected: null },
  ])('updates managementPort: $label', async ({ update, expected }) => {
    const created = await service.create(
      {
        name: 'Fixture',
        host: 'broker.invalid',
        port: 28883,
        password: 'test-password',
        managementPort: 25671,
      },
      ACTOR,
    );
    jest.clearAllMocks();

    const updated = await service.update(created.id, update, ACTOR);
    const loaded = await repository.findOneByOrFail({ id: created.id });

    expect(updated.managementPort).toBe(expected);
    expect(loaded.managementPort).toBe(expected);
    expect(loaded.port).toBe(28883);
    expect(loaded.password).toBe('fixture:test-password');
    expect(instanceToPlain(loaded)).toMatchObject({ managementPort: expected, port: 28883 });
    expect(instanceToPlain(loaded)).not.toHaveProperty('password');
    expect(encryption.decryptIfEncrypted).toHaveBeenCalledWith('fixture:test-password');
    expect(encryption.encrypt).toHaveBeenCalledWith('test-password');
    expect(metrics.mqttServersTotal.inc).not.toHaveBeenCalled();
    expect(metrics.mqttServersTotal.dec).not.toHaveBeenCalled();
  });
});
