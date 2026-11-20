import { Attractap, PluginBleEndpointEntity } from '@attraccess/database-entities';
import type { PluginBleEndpointRecord, PluginBleReaderAccess } from '@attraccess/application-models';
import { In, type DataSource } from 'typeorm';
import type { PluginBleStore } from '../../../plugin-system/ble/plugin-ble-store.port';

/** The endpoint id is a `uuid` column: PostgreSQL rejects any other text (22P02) instead of finding no row. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isEndpointId = (id: unknown): id is string => typeof id === 'string' && UUID.test(id);

function toEndpoint(row: PluginBleEndpointEntity): PluginBleEndpointRecord {
  return {
    id: row.id,
    pluginId: row.pluginId,
    readerId: row.readerId,
    address: row.address,
    addressType: row.addressType,
    profileId: row.profileId,
    label: row.label ?? null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function toReaderAccess(row: Pick<Attractap, 'id' | 'name' | 'allowPluginBle'>): PluginBleReaderAccess {
  return { id: row.id, name: row.name, allowPluginBle: Boolean(row.allowPluginBle) };
}

/** TypeORM implementation of the plugin BLE endpoint and reader opt-in persistence. */
export function createTypeOrmPluginBleStore(source: () => DataSource): PluginBleStore {
  const endpoints = () => source().getRepository(PluginBleEndpointEntity);
  const readers = () => source().getRepository(Attractap);
  const readerColumns = { id: true, name: true, allowPluginBle: true } as const;

  return {
    async listOpenReaders(readerIds) {
      const rows = await readers().find({
        where: readerIds ? { allowPluginBle: true, id: In(readerIds) } : { allowPluginBle: true },
        select: readerColumns,
        order: { id: 'ASC' },
      });
      return rows.map(toReaderAccess);
    },

    async findReader(readerId) {
      const row = await readers().findOne({ where: { id: readerId }, select: readerColumns });
      return row ? toReaderAccess(row) : null;
    },

    async findEndpoint(pluginId, id) {
      if (!isEndpointId(id)) return null;
      const row = await endpoints().findOneBy({ id, pluginId });
      return row ? toEndpoint(row) : null;
    },

    async listEndpoints(pluginId) {
      const rows = await endpoints().find({ where: { pluginId }, order: { createdAt: 'ASC', id: 'ASC' } });
      return rows.map(toEndpoint);
    },

    async listEndpointsAtAddress(address) {
      const rows = await endpoints().find({ where: { address }, select: { id: true, pluginId: true, readerId: true } });
      return rows.map(({ id, pluginId, readerId }) => ({ id, pluginId, readerId }));
    },

    async createEndpoint(endpoint) {
      const saved = await endpoints().save(endpoints().create({ ...endpoint }));
      return toEndpoint((await endpoints().findOneBy({ id: saved.id })) ?? saved);
    },

    async updateEndpoint(id, changes) {
      if (!isEndpointId(id)) return null;
      const current = await endpoints().findOneBy({ id });
      if (!current) return null;
      Object.assign(current, changes);
      const saved = await endpoints().save(current);
      return toEndpoint((await endpoints().findOneBy({ id: saved.id })) ?? saved);
    },

    async deleteEndpoint(id) {
      if (!isEndpointId(id)) return;
      await endpoints().delete({ id });
    },

    async deleteEndpointsOfPlugin(pluginId) {
      await endpoints().delete({ pluginId });
    },
  };
}
