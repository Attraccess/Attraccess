import { PluginReaderEntity, Resource, ResourceUsage, User, entities } from '@attraccess/database-entities';
import { ResourceType, type NewPluginReader, type UsageSession } from '@attraccess/application-models';
import { DataSource } from 'typeorm';
import type { PluginReaderStore } from '../../../plugin-system/readers/plugin-reader-store.port';
import type { UsageSessionStore } from '../../../resources/usage/usage-session-store.port';
import { usagePersistenceFor } from '../usage/sqlite-usage-persistence.test-fixture';
import { createTypeOrmPluginReaderStore } from './typeorm-plugin-reader.store';

/** An in-memory SQLite database with the full schema, behind the real plugin reader and usage session stores. */
export interface PluginReadersTestDatabase {
  /** The host connection the plugin module keeps. */
  connection: object;
  store: PluginReaderStore;
  usage: UsageSessionStore;
  /** An access-only door unless the fields say otherwise. */
  createDoor(fields?: { name?: string; type?: ResourceType; accessOnly?: boolean }): Promise<{ id: number }>;
  setAccessOnly(resourceId: number, accessOnly: boolean): Promise<void>;
  /** Deletes the resource row with foreign keys enforced, as a released database does. */
  deleteResource(resourceId: number): Promise<void>;
  createUser(fields?: { isDisabled?: boolean }): Promise<{ id: number; username: string }>;
  /** Stores readers directly, as earlier registrations left them. */
  insertReaders(readers: NewPluginReader[]): Promise<void>;
  /** Every stored door action, oldest first. */
  doorActions(): Promise<Array<Pick<UsageSession, 'resourceId' | 'userId' | 'usageAction'>>>;
  dispose(): Promise<void>;
}

export async function createPluginReadersTestDatabase(): Promise<PluginReadersTestDatabase> {
  const source = await new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: Object.values(entities),
    synchronize: true,
  }).initialize();
  const { store: usage } = usagePersistenceFor({ usage: source.getRepository(ResourceUsage) });
  let count = 0;

  return {
    connection: source,
    store: createTypeOrmPluginReaderStore(() => source),
    usage,
    async createDoor(fields = {}) {
      const door = await source.getRepository(Resource).save({
        name: `Door ${++count}`,
        type: ResourceType.Door,
        accessOnly: true,
        ...fields,
      } as Resource);
      return { id: door.id };
    },
    async setAccessOnly(resourceId, accessOnly) {
      await source.query(`UPDATE "resource" SET "accessOnly" = ? WHERE "id" = ?`, [accessOnly ? 1 : 0, resourceId]);
    },
    async deleteResource(resourceId) {
      await source.query('PRAGMA foreign_keys = ON');
      await source.query(`DELETE FROM "resource" WHERE "id" = ?`, [resourceId]);
    },
    async createUser(fields = {}) {
      const user = await source
        .getRepository(User)
        .save({ username: `user${++count}`, email: `u${count}@x.test`, ...fields } as User);
      return { id: user.id, username: user.username };
    },
    async insertReaders(readers) {
      await source
        .getRepository(PluginReaderEntity)
        .save(readers.map((reader) => ({ ...reader, resourceId: null })), { chunk: 50 });
    },
    async doorActions() {
      const rows = await source.getRepository(ResourceUsage).find({ order: { id: 'ASC' } });
      return rows.map(({ resourceId, userId, usageAction }) => ({ resourceId, userId, usageAction }));
    },
    dispose: () => source.destroy(),
  };
}
