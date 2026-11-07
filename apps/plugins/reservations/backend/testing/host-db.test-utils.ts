import { entities } from '@attraccess/plugins-backend-sdk';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { DataSource } from 'typeorm';

/** In-memory SQLite with the REAL host entities (synchronized), to run the plugin's host-table queries. */
export async function createHostDb() {
  const dataSource = await new DataSource({
    type: 'sqlite',
    database: ':memory:',
    entities: Object.values(entities),
    synchronize: true,
  }).initialize();
  const context = {
    dataSource,
    getRepository: (entity: never) => dataSource.getRepository(entity),
  } as unknown as PluginContext;
  const sql = (query: string, parameters: unknown[] = []) => dataSource.query(query, parameters);
  return { dataSource, context, sql };
}
