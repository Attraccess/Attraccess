import { Attractap, Resource, entities } from '@attraccess/database-entities';
import { DataSource, Table } from 'typeorm';
import type { AttractapReaderStore } from '../../../attractap/reader-store.port';
import type { PluginBleStore } from '../../../plugin-system/ble/plugin-ble-store.port';
import { PluginBleTransport1793300000000 } from '../../migrations/1793300000000-plugin-ble-transport';
import { TypeOrmAttractapReaderStore } from '../attractap/typeorm-reader.store';
import { createTypeOrmPluginBleStore } from './typeorm-plugin-ble.store';

/** An in-memory SQLite database with the reader and plugin BLE endpoint tables, behind the real BLE store adapter. */
export interface PluginBleTestDatabase {
  store: PluginBleStore;
  /** The reader store behind the same database, for tests that drive the real reader service. */
  readerStore: AttractapReaderStore;
  addReader(reader: { id: number; name: string; allowPluginBle: boolean }): Promise<void>;
  deleteReader(readerId: number): Promise<void>;
  setReaderAccess(readerId: number, allowed: boolean): Promise<void>;
  dispose(): Promise<void>;
}

/**
 * `fullSchema` synchronizes every entity (the reader service reads readers with their resources); by default only
 * the tables the BLE host needs are created, the endpoint table by its real migration.
 */
export async function createPluginBleTestDatabase(
  options: { fullSchema?: boolean } = {},
): Promise<PluginBleTestDatabase> {
  const source = await new DataSource({
    type: 'better-sqlite3',
    invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
    database: ':memory:',
    entities: Object.values(entities),
    synchronize: options.fullSchema ?? false,
  }).initialize();
  if (options.fullSchema) return wrap(source);
  const queryRunner = source.createQueryRunner();
  try {
    await queryRunner.createTable(Table.create(source.getMetadata(Attractap), source.driver));
    // The real migration creates the endpoint table, including its cascading foreign key to the reader.
    await new PluginBleTransport1793300000000().up(queryRunner);
  } finally {
    await queryRunner.release();
  }
  return wrap(source);
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
    dispose: () => source.destroy(),
  };
}
