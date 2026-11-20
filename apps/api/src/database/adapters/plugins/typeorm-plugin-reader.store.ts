import { NFCCard, PluginReaderEntity, Resource, User } from '@attraccess/database-entities';
import type { PluginReaderRecord, PluginReaderResource } from '@attraccess/application-models';
import { In, type DataSource } from 'typeorm';
import type { PluginReaderStore } from '../../../plugin-system/readers/plugin-reader-store.port';

function toReader(row: PluginReaderEntity): PluginReaderRecord {
  return {
    id: row.id,
    pluginId: row.pluginId,
    deviceId: row.deviceId,
    name: row.name,
    capabilities: {
      resourceTypes: [...row.capabilities.resourceTypes],
      actions: [...row.capabilities.actions],
    },
    resourceId: row.resourceId ?? null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

const resourceColumns = { id: true, name: true, type: true, separateUnlockAndUnlatch: true, accessOnly: true } as const;

function toResource(row: Resource): PluginReaderResource {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    separateUnlockAndUnlatch: row.separateUnlockAndUnlatch,
    accessOnly: row.accessOnly,
  };
}

/** TypeORM implementation of the plugin reader persistence. */
export function createTypeOrmPluginReaderStore(source: () => DataSource): PluginReaderStore {
  const readers = () => source().getRepository(PluginReaderEntity);

  return {
    async find(pluginId, deviceId) {
      const row = await readers().findOneBy({ pluginId, deviceId });
      return row ? toReader(row) : null;
    },

    async list(pluginId) {
      return (await readers().find({ where: { pluginId }, order: { id: 'ASC' } })).map(toReader);
    },

    count(pluginId) {
      return readers().countBy({ pluginId });
    },

    async create(reader) {
      const saved = await readers().save(readers().create({ ...reader, resourceId: null }));
      return toReader(await readers().findOneByOrFail({ id: saved.id }));
    },

    async update(id, changes) {
      if (Object.keys(changes).length > 0) await readers().update({ id }, changes);
      return toReader(await readers().findOneByOrFail({ id }));
    },

    async delete(pluginId, deviceId) {
      await readers().delete({ pluginId, deviceId });
    },

    async deleteAllOfPlugin(pluginId) {
      await readers().delete({ pluginId });
    },

    async findResource(resourceId) {
      const row = await source()
        .getRepository(Resource)
        .findOne({ where: { id: resourceId }, select: resourceColumns });
      return row ? toResource(row) : null;
    },

    async listResources(types) {
      const rows = await source()
        .getRepository(Resource)
        .find({ where: { type: In(types) }, select: resourceColumns, order: { name: 'ASC', id: 'ASC' } });
      return rows.map(toResource);
    },

    async findCardOwner(userId) {
      const row = await source()
        .getRepository(User)
        .findOne({ where: { id: userId }, select: { id: true, username: true, isDisabled: true } });
      return row ? { id: row.id, username: row.username, isDisabled: Boolean(row.isDisabled) } : null;
    },

    isActiveCardOf(cardId, userId) {
      return source()
        .getRepository(NFCCard)
        .existsBy({ id: cardId, isActive: true, user: { id: userId } });
    },
  };
}
