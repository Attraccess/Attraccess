import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DataSource } from 'typeorm';
import { createSqliteSource } from '../../../sqlite/sqlite-source';
import { sqliteRowPages } from './sqlite-rows';

describe('sqliteRowPages', () => {
  let directory: string;
  let source: DataSource;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'attraccess-sqlite-rows-'));
    source = createSqliteSource(join(directory, 'attraccess.sqlite'));
    await source.initialize();
  });

  afterEach(async () => {
    await source.destroy();
    await rm(directory, { recursive: true, force: true });
  });

  it('reads every row once, in rowid order, also with ids beyond the safe integers', async () => {
    await source.query('CREATE TABLE "item" ("id" integer PRIMARY KEY, "note" text)');
    const ids = ['-9223372036854775808', '-9007199254740993', '1', '2', '9007199254740993', '9007199254740994'];
    for (const id of ids) await source.query(`INSERT INTO "item" ("id", "note") VALUES (${id}, 'n${id}')`);

    const read: string[] = [];
    for await (const page of sqliteRowPages(source, 'item', ['id', 'note'], 2)) {
      for (const row of page) read.push(row[0].exact as string);
    }

    expect(read).toEqual(ids);
  });
});
