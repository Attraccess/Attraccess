import { entities } from '@attraccess/plugins-backend-sdk';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { DataSource } from 'typeorm';

/** In-memory SQLite with the REAL host entities (synchronized), to run the plugin's host-table queries. */
export async function createHostDb() {
  const dataSource = await new DataSource({
    type: 'sqlite',
    database: ':memory:',
    // The SDK's entity barrel also re-exports enums and schemas, which TypeORM's entity list type does not accept.
    entities: Object.values(entities) as never,
    synchronize: true,
  }).initialize();
  const context = {
    dataSource,
    getRepository: (entity: never) => dataSource.getRepository(entity),
  } as unknown as PluginContext;
  const sql = (query: string, parameters: unknown[] = []) => dataSource.query(query, parameters);
  return { dataSource, context, sql };
}
