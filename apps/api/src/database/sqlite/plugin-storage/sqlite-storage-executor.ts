import type { EntityManager } from 'typeorm';
import type {
  PluginStorageExecutor,
  PluginStorageWriteResult,
} from '../../../plugin-system/plugin-storage/storage-dialect.port';

/**
 * Runs statements on a TypeORM entity manager of a private SQLite connection (the plugin migration engine of the
 * import path). TypeORM is only the carrier: statements are raw SQL with bound parameters built by the storage layer.
 */
export class ManagerExecutor implements PluginStorageExecutor {
  constructor(private readonly manager: EntityManager) {}

  query(sql: string, params: readonly unknown[]): Promise<Record<string, unknown>[]> {
    return this.manager.query(sql, [...params]);
  }

  async execute(sql: string, params: readonly unknown[]): Promise<PluginStorageWriteResult> {
    const result = await this.write(sql, params);
    return { affected: result.affected ?? 0 };
  }

  async insert(sql: string, params: readonly unknown[], generatedKey: string | undefined): Promise<unknown> {
    const result = await this.write(sql, params);
    // For an INSERT the driver reports the last row id: the generated INTEGER PRIMARY KEY.
    return generatedKey === undefined ? undefined : Number(result.raw);
  }

  private write(sql: string, params: readonly unknown[]): Promise<{ affected?: number; raw: unknown }> {
    const runner = this.manager.queryRunner;
    if (!runner) throw new Error('A write needs a transaction.');
    return runner.query(sql, [...params], true);
  }
}
