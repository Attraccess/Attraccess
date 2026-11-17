import type { NewPluginBleEndpoint } from '@attraccess/application-models';
import { classifyPersistenceError } from '../../persistence-errors';
import { createPluginBleTestDatabase, PluginBleTestDatabase } from './plugin-ble-database.test-fixture';

const endpoint = (overrides: Partial<NewPluginBleEndpoint> = {}): NewPluginBleEndpoint => ({
  id: '00000000-0000-4000-8000-000000000001',
  pluginId: 'locks',
  readerId: 1,
  address: 'AA:BB:CC:DD:EE:01',
  addressType: 'public',
  profileId: 'door-v1',
  ...overrides,
});

/** The plugin BLE store on SQLite, its endpoint table created by the released migration. */
describe('TypeORM plugin BLE store on SQLite', () => {
  let db: PluginBleTestDatabase;

  beforeEach(async () => {
    db = await createPluginBleTestDatabase();
    await db.addReader({ id: 1, name: 'Front door', allowPluginBle: true });
    await db.addReader({ id: 2, name: 'Workshop', allowPluginBle: false });
    await db.addReader({ id: 3, name: 'Back door', allowPluginBle: true });
  });

  afterEach(async () => {
    await db.dispose();
  });

  describe('readers', () => {
    it('lists only the readers that opted in, by id, with the opt-in as a boolean', async () => {
      expect(await db.store.listOpenReaders()).toEqual([
        { id: 1, name: 'Front door', allowPluginBle: true },
        { id: 3, name: 'Back door', allowPluginBle: true },
      ]);
    });

    it('finds one reader whatever its opt-in, and null for an unknown one', async () => {
      expect(await db.store.findReader(2)).toEqual({ id: 2, name: 'Workshop', allowPluginBle: false });
      expect(await db.store.findReader(99)).toBeNull();
    });
  });

  describe('endpoints', () => {
    it('returns a created endpoint as stored, with dates and a null label', async () => {
      const created = await db.store.createEndpoint(endpoint());

      expect(created).toEqual({
        ...endpoint(),
        label: null,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
      expect(Number.isNaN(created.createdAt.getTime())).toBe(false);
      expect(await db.store.findEndpoint('locks', created.id)).toEqual(created);
    });

    it("finds and lists a plugin's own endpoints only, oldest first", async () => {
      await db.store.createEndpoint(endpoint({ id: 'a', label: 'first' }));
      await db.store.createEndpoint(endpoint({ id: 'b', readerId: 3 }));
      await db.store.createEndpoint(endpoint({ id: 'c', pluginId: 'other' }));

      expect((await db.store.listEndpoints('locks')).map((row) => row.id)).toEqual(['a', 'b']);
      expect(await db.store.findEndpoint('other', 'a')).toBeNull();
      expect(await db.store.findEndpoint('locks', 'a')).toMatchObject({ label: 'first' });
    });

    it('lists every binding of an address across plugins and readers', async () => {
      await db.store.createEndpoint(endpoint({ id: 'a' }));
      await db.store.createEndpoint(endpoint({ id: 'b', pluginId: 'other', readerId: 3 }));
      await db.store.createEndpoint(endpoint({ id: 'c', address: 'AA:BB:CC:DD:EE:02' }));

      const bound = await db.store.listEndpointsAtAddress('AA:BB:CC:DD:EE:01');

      expect(bound.sort((x, y) => x.id.localeCompare(y.id))).toEqual([
        { id: 'a', pluginId: 'locks', readerId: 1 },
        { id: 'b', pluginId: 'other', readerId: 3 },
      ]);
    });

    it('applies changes and returns the stored endpoint; null for one that is gone', async () => {
      await db.store.createEndpoint(endpoint({ id: 'a' }));

      const updated = await db.store.updateEndpoint('a', { readerId: 3, label: 'moved', addressType: 'random' });

      expect(updated).toMatchObject({ id: 'a', readerId: 3, label: 'moved', addressType: 'random' });
      expect(updated?.updatedAt).toBeInstanceOf(Date);
      expect(await db.store.updateEndpoint('missing', { label: 'x' })).toBeNull();
    });

    it('deletes one endpoint, or all of a plugin, leaving other plugins alone', async () => {
      await db.store.createEndpoint(endpoint({ id: 'a' }));
      await db.store.createEndpoint(endpoint({ id: 'b', address: 'AA:BB:CC:DD:EE:02' }));
      await db.store.createEndpoint(endpoint({ id: 'c', pluginId: 'other' }));

      await db.store.deleteEndpoint('a');
      expect((await db.store.listEndpoints('locks')).map((row) => row.id)).toEqual(['b']);

      await db.store.deleteEndpointsOfPlugin('locks');
      expect(await db.store.listEndpoints('locks')).toEqual([]);
      expect((await db.store.listEndpoints('other')).map((row) => row.id)).toEqual(['c']);
    });
  });

  describe('constraints the host interprets', () => {
    it('rejects a second binding of the same plugin, reader and address as a unique violation', async () => {
      await db.store.createEndpoint(endpoint({ id: 'a' }));

      const failure = await db.store.createEndpoint(endpoint({ id: 'b' })).catch((error: unknown) => error);

      expect(classifyPersistenceError(failure)).toBe('unique-violation');
    });

    it('rejects an endpoint on an unknown reader as a foreign key violation', async () => {
      const failure = await db.store.createEndpoint(endpoint({ readerId: 99 })).catch((error: unknown) => error);

      expect(classifyPersistenceError(failure)).toBe('foreign-key-violation');
    });

    it("drops a reader's endpoints with the reader", async () => {
      await db.store.createEndpoint(endpoint({ id: 'a' }));
      await db.store.createEndpoint(endpoint({ id: 'b', readerId: 3 }));

      await db.deleteReader(1);

      expect((await db.store.listEndpoints('locks')).map((row) => row.id)).toEqual(['b']);
    });
  });
});
