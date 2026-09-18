import 'reflect-metadata';
import { instanceToPlain } from 'class-transformer';
import { DataSource, Repository } from 'typeorm';
import { MqttServer } from '@attraccess/database-entities';
import { MqttServerManagementPort1783800000000 } from '../../database/migrations/1783800000000-mqtt-server-management-port';
import type { EncryptionService } from '../../encryption/encryption.service';
import type { MetricsService } from '../../metrics/metrics.service';
import { MqttServerService } from './mqtt-server.service';

// Keep the service's runtime imports isolated from application configuration and plugins.
jest.mock('@attraccess/database-entities', () => ({
  MqttServer: jest.requireActual('../../../../../libs/database-entities/src/lib/entities/mqttServer.entity').MqttServer,
}));
jest.mock('../../encryption/encryption.service', () => ({ EncryptionService: class {} }));
jest.mock('../../metrics/metrics.service', () => ({ MetricsService: class {} }));

describe('MQTT managementPort migration, persistence and service', () => {
  let dataSource: DataSource;
  let repository: Repository<MqttServer>;
  let service: MqttServerService;
  const migration = new MqttServerManagementPort1783800000000();
  const encryption = {
    encrypt: jest.fn((value: string) => `fixture:${value}`),
    decryptIfEncrypted: jest.fn((value: string) => value.replace(/^fixture:/, '')),
  };
  const metrics = { mqttServersTotal: { inc: jest.fn(), dec: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [MqttServer],
      synchronize: false,
      migrationsRun: false,
    });
    await dataSource.initialize();
    // Explicit pre-migration fixture, never the application datasource or migration registry.
    await dataSource.query(`CREATE TABLE "mqtt_server" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      "name" text NOT NULL,
      "host" text NOT NULL,
      "port" integer NOT NULL,
      "username" text,
      "password" text,
      "clientId" text,
      "useTls" boolean NOT NULL DEFAULT 0,
      "caCert" text,
      "tlsInsecure" boolean NOT NULL DEFAULT 0,
      "tlsServername" text,
      "defaultPublishQos" integer NOT NULL DEFAULT 0,
      "defaultPublishRetain" boolean NOT NULL DEFAULT 0,
      "defaultSubscribeQos" integer NOT NULL DEFAULT 0,
      "createdAt" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await dataSource.query('INSERT INTO "mqtt_server" ("name", "host", "port") VALUES (?, ?, ?)', [
      'Legacy fixture',
      'legacy.invalid',
      28883,
    ]);
    const runner = dataSource.createQueryRunner();
    try {
      await migration.up(runner);
    } finally {
      await runner.release();
    }
    repository = dataSource.getRepository(MqttServer);
    service = new MqttServerService(
      repository,
      encryption as unknown as EncryptionService,
      metrics as unknown as MetricsService,
    );
  });

  afterEach(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('migrates legacy rows to null and rolls back without losing existing data', async () => {
    const legacy = await repository.findOneByOrFail({ id: 1 });
    expect(legacy.managementPort).toBeNull();
    expect(instanceToPlain(legacy)).toMatchObject({ managementPort: null, port: 28883 });
    await repository.update(1, { managementPort: 25671 });

    const runner = dataSource.createQueryRunner();
    try {
      const column = (await runner.getTable('mqtt_server'))?.findColumnByName('managementPort');
      expect(column).toMatchObject({ type: 'integer', isNullable: true });
      const [before] = await runner.query('SELECT * FROM "mqtt_server" WHERE "id" = 1');
      expect(before.managementPort).toBe(25671);
      delete before.managementPort;

      await migration.down(runner);

      expect((await runner.getTable('mqtt_server'))?.findColumnByName('managementPort')).toBeUndefined();
      expect(await runner.query('SELECT * FROM "mqtt_server"')).toEqual([before]);
    } finally {
      await runner.release();
    }
  });

  it.each([
    { label: 'minimum', input: { managementPort: 1 }, expected: 1 },
    { label: 'custom', input: { managementPort: 25671 }, expected: 25671 },
    { label: 'maximum', input: { managementPort: 65535 }, expected: 65535 },
    { label: 'null', input: { managementPort: null }, expected: null },
    { label: 'omitted', input: {}, expected: null },
  ])('creates, reloads and serializes $label managementPort', async ({ input, expected }) => {
    const created = await service.create({
      name: 'Fixture',
      host: 'broker.invalid',
      port: 28883,
      password: 'test-password',
      ...input,
    });
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
    const created = await service.create({
      name: 'Fixture',
      host: 'broker.invalid',
      port: 28883,
      password: 'test-password',
      managementPort: 25671,
    });
    jest.clearAllMocks();

    const updated = await service.update(created.id, update);
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
