import { Attractap, Resource } from '@attraccess/database-entities';
import type { DataSource } from 'typeorm';
import type { AttractapReaderStore } from '../../../attractap/reader-store.port';
import type { PluginBleStore } from '../../../plugin-system/ble/plugin-ble-store.port';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { TypeOrmAttractapReaderStore } from '../attractap/typeorm-reader.store';
import { createTypeOrmPluginBleStore } from './typeorm-plugin-ble.store';

/** A PostgreSQL database with the reader and plugin BLE endpoint tables, behind the real BLE store adapter. */
export interface PluginBleTestDatabase {
  store: PluginBleStore;
  /** The reader store behind the same database, for tests that drive the real reader service. */
  readerStore: AttractapReaderStore;
  addReader(reader: { id: number; name: string; allowPluginBle: boolean }): Promise<void>;
  deleteReader(readerId: number): Promise<void>;
  setReaderAccess(readerId: number, allowed: boolean): Promise<void>;
  dispose(): Promise<void>;
}

/** The database starts at the current release, so the reader and endpoint tables (with their cascading foreign key) exist. */
/** `options` is kept for callers: the schema is always complete. */
export async function createPluginBleTestDatabase(_options: { fullSchema?: boolean } = {}): Promise<PluginBleTestDatabase> {
  return wrap(await createTestDataSource());
}

function wrap(source: DataSource): PluginBleTestDatabase {
  const readers = () => source.getRepository(Attractap);
  return {
    readerStore: new TypeOrmAttractapReaderStore(readers(), source.getRepository(Resource)),
    store: createTypeOrmPluginBleStore(() => source),
    async addReader(reader) {
      await readers().insert({
        id: reader.id,
        name: reader.name,
        apiTokenHash: 'hash',
        allowPluginBle: reader.allowPluginBle,
      } as Attractap);
    },
    async deleteReader(readerId) {
      await readers().delete(readerId);
    },
    async setReaderAccess(readerId, allowed) {
      await readers().update(readerId, { allowPluginBle: allowed });
    },
    dispose: () => closeTestDataSource(source),
  };
}
