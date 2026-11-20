import { NFCCard, PluginReaderEntity, Resource, ResourceUsage, User } from '@attraccess/database-entities';
import { ResourceType, type NewPluginReader, type UsageSession } from '@attraccess/application-models';
import type { PluginReaderStore } from '../../../plugin-system/readers/plugin-reader-store.port';
import type { UsageSessionStore } from '../../../resources/usage/usage-session-store.port';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { usagePersistenceFor } from '../usage/usage-persistence.test-fixture';
import { createTypeOrmPluginReaderStore } from './typeorm-plugin-reader.store';

/** A PostgreSQL database with the full schema, behind the real plugin reader and usage session stores. */
export interface PluginReadersTestDatabase {
  /** The host connection the plugin module keeps. */
  connection: object;
  store: PluginReaderStore;
  usage: UsageSessionStore;
  /** An access-only door unless the fields say otherwise. */
  createDoor(fields?: { name?: string; type?: ResourceType; accessOnly?: boolean }): Promise<{ id: number }>;
  setAccessOnly(resourceId: number, accessOnly: boolean): Promise<void>;
  /** Deletes the resource row with its foreign keys enforced. */
  deleteResource(resourceId: number): Promise<void>;
  /** A user with one active card (see `cardOf`). */
  createUser(fields?: { isDisabled?: boolean }): Promise<{ id: number; username: string }>;
  /** The id of the user's card, 0 for a user without one. */
  cardOf(userId: number): number;
  deactivateCard(cardId: number): Promise<void>;
  deleteCard(cardId: number): Promise<void>;
  /** Stores readers directly, as earlier registrations left them. */
  insertReaders(readers: NewPluginReader[]): Promise<void>;
  /** Every stored door action, oldest first. */
  doorActions(): Promise<Array<Pick<UsageSession, 'resourceId' | 'userId' | 'usageAction'>>>;
  dispose(): Promise<void>;
}

export async function createPluginReadersTestDatabase(): Promise<PluginReadersTestDatabase> {
  const source = await createTestDataSource();
  const { store: usage } = usagePersistenceFor({ usage: source.getRepository(ResourceUsage) });
  let count = 0;
  const cards = new Map<number, number>();

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
      await source.query(`UPDATE "resource" SET "accessOnly" = $1 WHERE "id" = $2`, [accessOnly, resourceId]);
    },
    async deleteResource(resourceId) {
      await source.query(`DELETE FROM "resource" WHERE "id" = $1`, [resourceId]);
    },
    async createUser(fields = {}) {
      const user = await source
        .getRepository(User)
        .save({ username: `user${++count}`, email: `u${count}@x.test`, ...fields } as User);
      const card = await source
        .getRepository(NFCCard)
        .save({ uid: `0401${user.id}`, keyNo: 0, key: '00', isActive: true, user } as NFCCard);
      cards.set(user.id, card.id);
      return { id: user.id, username: user.username };
    },
    cardOf: (userId) => cards.get(userId) ?? 0,
    async deactivateCard(cardId) {
      await source.getRepository(NFCCard).update(cardId, { isActive: false });
    },
    async deleteCard(cardId) {
      await source.getRepository(NFCCard).delete(cardId);
    },
    async insertReaders(readers) {
      await source.getRepository(PluginReaderEntity).save(
        readers.map((reader) => ({ ...reader, resourceId: null })),
        { chunk: 50 },
      );
    },
    async doorActions() {
      const rows = await source.getRepository(ResourceUsage).find({ order: { id: 'ASC' } });
      return rows.map(({ resourceId, userId, usageAction }) => ({ resourceId, userId, usageAction }));
    },
    dispose: () => closeTestDataSource(source),
  };
}
