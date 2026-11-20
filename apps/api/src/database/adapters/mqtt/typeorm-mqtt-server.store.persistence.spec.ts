import { MqttServer } from '@attraccess/database-entities';
import { DataSource } from 'typeorm';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { TypeOrmMqttServerStore } from './typeorm-mqtt-server.store';

describe('TypeOrmMqttServerStore on real PostgreSQL', () => {
  let source: DataSource;
  let store: TypeOrmMqttServerStore;

  beforeEach(async () => {
    source = await createTestDataSource();
    store = new TypeOrmMqttServerStore(source.getRepository(MqttServer));
  });

  afterEach(() => closeTestDataSource(source));

  it('creates a server with stored defaults and neutral nulls', async () => {
    const created = await store.createServer({ name: 'Broker', host: 'b.invalid', port: 1883 });
    expect(created).toMatchObject({
      name: 'Broker',
      managementPort: null,
      username: null,
      password: null,
      useTls: false,
      defaultPublishQos: 0,
      defaultPublishRetain: false,
    });
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created).not.toBeInstanceOf(MqttServer);
    expect(await store.findServer(created.id)).toEqual(created);
  });

  it('applies only the given changes and reports a missing server as null', async () => {
    const { id } = await store.createServer({ name: 'Broker', host: 'b.invalid', port: 1883, managementPort: 25671 });
    const updated = await store.updateServer(id, { name: 'Renamed', managementPort: undefined });
    expect(updated).toMatchObject({ name: 'Renamed', managementPort: 25671, port: 1883 });
    expect((await store.updateServer(id, { managementPort: null }))?.managementPort).toBeNull();
    expect(await store.updateServer(999, { name: 'x' })).toBeNull();
  });

  it('looks distinct existing ids up in one call and handles an empty list', async () => {
    const a = await store.createServer({ name: 'A', host: 'a', port: 1 });
    const b = await store.createServer({ name: 'B', host: 'b', port: 1 });
    await expect(store.findExistingServerIds([a.id, 999, a.id, b.id])).resolves.toEqual(new Set([a.id, b.id]));
    await expect(store.findExistingServerIds([])).resolves.toEqual(new Set());
  });

  it('stores an encrypted password and deletes a server', async () => {
    const { id } = await store.createServer({ name: 'A', host: 'a', port: 1, password: 'plain' });
    await store.storeEncryptedPassword(id, 'enc:plain');
    expect((await store.findServer(id))?.password).toBe('enc:plain');
    expect(await store.listServers()).toHaveLength(1);
    await store.deleteServer(id);
    expect(await store.findServer(id)).toBeNull();
  });
});
