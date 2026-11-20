import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { readSqlitePermissionOwners } from './sqlite-permission-owners';

describe('readSqlitePermissionOwners', () => {
  let directory: string;
  let options: DataSourceOptions;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'permission-owners-'));
    options = {
      type: 'better-sqlite3',
      invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
      database: join(directory, 'db.sqlite'),
    };
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  const seed = async (statements: string[]) => {
    const source = await new DataSource(options).initialize();
    for (const statement of statements) await source.query(statement);
    await source.destroy();
  };

  it('returns no owners when the database does not exist yet', async () => {
    expect(await readSqlitePermissionOwners(options)).toEqual(new Map());
  });

  it('reads the owning plugin of each key, null for core keys', async () => {
    await seed([
      `CREATE TABLE "permission" ("key" text PRIMARY KEY, "pluginName" text)`,
      `INSERT INTO "permission" VALUES ('resources.read', NULL), ('acme.widgets.read', 'acme')`,
    ]);
    expect(await readSqlitePermissionOwners(options)).toEqual(
      new Map([
        ['resources.read', null],
        ['acme.widgets.read', 'acme'],
      ]),
    );
  });

  it('treats every key as core before the owner column exists', async () => {
    await seed([
      `CREATE TABLE "permission" ("key" text PRIMARY KEY)`,
      `INSERT INTO "permission" VALUES ('resources.read')`,
    ]);
    expect(await readSqlitePermissionOwners(options)).toEqual(new Map([['resources.read', null]]));
  });

  it('returns no owners before the RBAC tables exist', async () => {
    await seed([`CREATE TABLE "other" ("id" integer)`]);
    expect(await readSqlitePermissionOwners(options)).toEqual(new Map());
  });
});
