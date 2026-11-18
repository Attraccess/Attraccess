import type { NewPluginBleEndpoint } from '@attraccess/application-models';
import { classifyPersistenceError } from '../../persistence-errors';
import { createPluginBleTestDatabase, PluginBleTestDatabase } from './plugin-ble-database.test-fixture';

const ID_A = '00000000-0000-4000-8000-00000000000a';
const ID_B = '00000000-0000-4000-8000-00000000000b';
const ID_C = '00000000-0000-4000-8000-00000000000c';
const endpoint = (overrides: Partial<NewPluginBleEndpoint> = {}): NewPluginBleEndpoint => ({
  id: '00000000-0000-4000-8000-000000000001',
  pluginId: 'locks',
  readerId: 1,
  address: 'AA:BB:CC:DD:EE:01',
  addressType: 'public',
  profileId: 'door-v1',
  ...overrides,
});

/** The plugin BLE store on PostgreSQL at the current release. */
describe('TypeORM plugin BLE store on PostgreSQL', () => {
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
      await db.store.createEndpoint(endpoint({ id: ID_A, label: 'first' }));
      await db.store.createEndpoint(endpoint({ id: ID_B, readerId: 3 }));
      await db.store.createEndpoint(endpoint({ id: ID_C, pluginId: 'other' }));

      expect((await db.store.listEndpoints('locks')).map((row) => row.id)).toEqual([ID_A, ID_B]);
      expect(await db.store.findEndpoint('other', ID_A)).toBeNull();
      expect(await db.store.findEndpoint('locks', ID_A)).toMatchObject({ label: 'first' });
    });

    it('lists every binding of an address across plugins and readers', async () => {
      await db.store.createEndpoint(endpoint({ id: ID_A }));
      await db.store.createEndpoint(endpoint({ id: ID_B, pluginId: 'other', readerId: 3 }));
      await db.store.createEndpoint(endpoint({ id: ID_C, address: 'AA:BB:CC:DD:EE:02' }));

      const bound = await db.store.listEndpointsAtAddress('AA:BB:CC:DD:EE:01');

      expect(bound.sort((x, y) => x.id.localeCompare(y.id))).toEqual([
        { id: ID_A, pluginId: 'locks', readerId: 1 },
        { id: ID_B, pluginId: 'other', readerId: 3 },
      ]);
    });

    it('applies changes and returns the stored endpoint; null for one that is gone', async () => {
      await db.store.createEndpoint(endpoint({ id: ID_A }));

      const updated = await db.store.updateEndpoint(ID_A, { readerId: 3, label: 'moved', addressType: 'random' });

      expect(updated).toMatchObject({ id: ID_A, readerId: 3, label: 'moved', addressType: 'random' });
      expect(updated?.updatedAt).toBeInstanceOf(Date);
      expect(await db.store.updateEndpoint('00000000-0000-4000-8000-0000000000ff', { label: 'x' })).toBeNull();
    });

    it('deletes one endpoint, or all of a plugin, leaving other plugins alone', async () => {
      await db.store.createEndpoint(endpoint({ id: ID_A }));
      await db.store.createEndpoint(endpoint({ id: ID_B, address: 'AA:BB:CC:DD:EE:02' }));
      await db.store.createEndpoint(endpoint({ id: ID_C, pluginId: 'other' }));

      await db.store.deleteEndpoint(ID_A);
      expect((await db.store.listEndpoints('locks')).map((row) => row.id)).toEqual([ID_B]);

      await db.store.deleteEndpointsOfPlugin('locks');
      expect(await db.store.listEndpoints('locks')).toEqual([]);
      expect((await db.store.listEndpoints('other')).map((row) => row.id)).toEqual([ID_C]);
    });
  });

  describe('constraints the host interprets', () => {
    it('rejects a second binding of the same plugin, reader and address as a unique violation', async () => {
      await db.store.createEndpoint(endpoint({ id: ID_A }));

      const failure = await db.store.createEndpoint(endpoint({ id: ID_B })).catch((error: unknown) => error);

      expect(classifyPersistenceError(failure)).toBe('unique-violation');
    });

    it('rejects an endpoint on an unknown reader as a foreign key violation', async () => {
      const failure = await db.store.createEndpoint(endpoint({ readerId: 99 })).catch((error: unknown) => error);

      expect(classifyPersistenceError(failure)).toBe('foreign-key-violation');
    });

    it("drops a reader's endpoints with the reader", async () => {
      await db.store.createEndpoint(endpoint({ id: ID_A }));
      await db.store.createEndpoint(endpoint({ id: ID_B, readerId: 3 }));

      await db.deleteReader(1);

      expect((await db.store.listEndpoints('locks')).map((row) => row.id)).toEqual([ID_B]);
    });
  });
});
