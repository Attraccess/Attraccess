import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DataSource, DataSourceOptions } from 'typeorm';
import { createSqliteSource } from './sqlite-source';

/**
 * A SQLite database file for specs of the import path (the only code that still reads SQLite). The runtime database
 * is PostgreSQL; a SQLite spec opens its file through sqlite-source.ts, the same factory the transfer uses.
 */
export interface SqliteTestFile {
  readonly file: string;
  readonly source: DataSource;
  close(): Promise<void>;
}

export async function createSqliteTestFile(extra: Partial<DataSourceOptions> = {}): Promise<SqliteTestFile> {
  const directory = await mkdtemp(join(tmpdir(), 'sqlite-import-spec-'));
  const file = join(directory, 'attraccess.sqlite');
  const source = createSqliteSource(file, extra);
  await source.initialize();
  return {
    file,
    source,
    async close() {
      if (source.isInitialized) await source.destroy();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
