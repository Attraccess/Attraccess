import { DataSource } from 'typeorm';
import { WagoManagementEntity } from './wago-management.entity';
import { WagoManagement1780000000010 } from './wago-management.migration';
import { RepositoryManagementStore } from './wago-management-store';
import type { ManagementRecord } from './wago-management.types';

// Entity decorators use the actual TypeORM copy, without loading unrelated host application services.
jest.mock('@attraccess/plugins-backend-sdk', () => jest.requireActual('typeorm'));

describe('persistent management repository and migration', () => {
  let database: DataSource;
  beforeEach(async () => {
    database = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [WagoManagementEntity],
      migrations: [WagoManagement1780000000010],
      synchronize: false,
    }).initialize();
    await database.runMigrations();
  });
  afterEach(async () => {
    await database?.destroy();
  });

  it('stores ciphertext separately, excludes it from ordinary entity queries, and fences stale writers', async () => {
    const repository = database.getRepository(WagoManagementEntity);
    const store = new RepositoryManagementStore(repository);
    const record: ManagementRecord = {
      target: { controllerId: 1, host: '10.88.0.1', hostKeyFingerprint: `SHA256:${'a'.repeat(43)}` },
      state: 'preparing',
      inspection: null,
      mode: 'baseline',
      exceptions: [],
      support: 'qualification_required',
      reviewToken: null,
      reviewedAt: null,
      transaction: null,
      keyFingerprint: null,
      encryptedPrivateKey: 'host-encrypted-envelope',
      failure: null,
    };
    expect(await store.acquire(1, 'first', 1000, 2000)).toBe(true);
    expect(await store.acquire(1, 'other-process', 1001, 2001)).toBe(false);
    await store.save(1, 'first', record, 1002);
    const freshStore = new RepositoryManagementStore(repository);
    expect(await freshStore.load(1)).toEqual(record);
    const entity = await repository.findOneByOrFail({ controllerId: 1 });
    expect(entity.encryptedPrivateKey).toBeUndefined();
    expect(entity.metadataJson).not.toContain('host-encrypted-envelope');
    expect(await freshStore.acquire(1, 'restarted', 2001, 3001)).toBe(true);
    await store.release(1, 'first'); // cannot release a successor's lock
    await expect(store.save(1, 'first', record, 2002)).rejects.toThrow('lease_lost');
    expect(await store.acquire(1, 'third', 2003, 3003)).toBe(false);
    await freshStore.release(1, 'restarted');
    expect(await store.acquire(1, 'third', 2004, 3004)).toBe(true);
  });

  it('refuses a downgrade that would erase a management key or recovery lease', async () => {
    const store = new RepositoryManagementStore(database.getRepository(WagoManagementEntity));
    await store.acquire(1, 'owner', 1000, 2000);
    await expect(database.undoLastMigration()).rejects.toThrow('Recover management transitions');
    await store.release(1, 'owner');
    await database.undoLastMigration();
    expect(await database.createQueryRunner().hasTable('plugin_wago_management')).toBe(false);
  });
});
