import { Client } from 'pg';
import { DataSource } from 'typeorm';
import {
  createTestDatabaseLocation,
  createTestDataSourceOptions,
  type TestDatabaseLocation,
} from '../../test-utils/test-database';
import { openPostgresStartupSettings, readPostgresPermissionOwners } from './postgres-startup-reads';

/** The startup reads run before the application connection exists, on short-lived connections of their own. */
describe('postgres startup reads', () => {
  let database: TestDatabaseLocation | undefined;

  afterEach(async () => {
    await database?.remove();
    database = undefined;
  });

  const open = async (empty: boolean) => {
    database = await createTestDatabaseLocation({ empty });
    return createTestDataSourceOptions({ location: database.location, entities: [] });
  };

  const sql = async (statements: string[]) => {
    const client = new Client({ connectionString: database?.location });
    await client.connect();
    try {
      const results = [];
      for (const statement of statements) results.push(await client.query(statement));
      return results;
    } finally {
      await client.end();
    }
  };

  const tableExists = async (table: string) => {
    const [result] = await sql([`SELECT to_regclass('public.${table}') IS NOT NULL AS "exists"`]);
    return result.rows[0].exists as boolean;
  };

  describe('readPostgresPermissionOwners', () => {
    it('returns no owners on a fresh database (no permission table yet) and creates nothing', async () => {
      const options = await open(true);
      expect(await readPostgresPermissionOwners(options)).toEqual(new Map());
      expect(await tableExists('permission')).toBe(false);
    });

    it('reads the owning plugin of each key, null for core keys', async () => {
      const options = await open(true);
      await sql([
        `CREATE TABLE "permission" ("key" text PRIMARY KEY, "pluginName" text)`,
        `INSERT INTO "permission" VALUES ('resources.read', NULL), ('acme.widgets.read', 'acme')`,
      ]);
      expect(await readPostgresPermissionOwners(options)).toEqual(
        new Map([
          ['resources.read', null],
          ['acme.widgets.read', 'acme'],
        ]),
      );
    });

    it('treats every key as core before the owner column exists', async () => {
      const options = await open(true);
      await sql([
        `CREATE TABLE "permission" ("key" text PRIMARY KEY)`,
        `INSERT INTO "permission" VALUES ('resources.read')`,
      ]);
      expect(await readPostgresPermissionOwners(options)).toEqual(new Map([['resources.read', null]]));
    });

    it('returns no owners before the RBAC tables exist', async () => {
      const options = await open(true);
      await sql([`CREATE TABLE "other" ("id" integer)`]);
      expect(await readPostgresPermissionOwners(options)).toEqual(new Map());
    });

    it('reads the registered keys of a database at the current release, closing its connection', async () => {
      const options = await open(false);
      await sql([
        `INSERT INTO "permission" ("key", "label", "description", "category", "pluginName") ` +
          `VALUES ('acme.widgets.read', 'Read widgets', 'Read widgets', 'acme', 'acme')`,
      ]);
      const destroy = jest.spyOn(DataSource.prototype, 'destroy');
      try {
        const owners = await readPostgresPermissionOwners(options);
        expect(owners.get('acme.widgets.read')).toBe('acme');
        expect([...owners.values()].filter((owner) => owner !== null)).toEqual(['acme']);
        expect(destroy).toHaveBeenCalledTimes(1);
      } finally {
        destroy.mockRestore();
      }
    });
  });

  describe('openPostgresStartupSettings', () => {
    it('returns null on a fresh install, creates nothing and closes its connection', async () => {
      const options = await open(true);
      const destroy = jest.spyOn(DataSource.prototype, 'destroy');
      try {
        await expect(openPostgresStartupSettings(options)).resolves.toBeNull();
        expect(destroy).toHaveBeenCalledTimes(1);
      } finally {
        destroy.mockRestore();
      }
      expect(await tableExists('setting')).toBe(false);
    });

    it('reads stored settings and closes its connection once', async () => {
      const options = await open(false);
      await sql([
        `INSERT INTO "setting" ("parent", "key", "value") VALUES ('app', 'backend_url', 'https://attraccess.example')`,
      ]);
      const destroy = jest.spyOn(DataSource.prototype, 'destroy');
      try {
        const settings = await openPostgresStartupSettings(options);
        expect(settings).not.toBeNull();
        try {
          expect(await settings?.findValue('app', 'backend_url')).toBe('https://attraccess.example');
          expect(await settings?.findValue('app', 'license_key')).toBeNull();
        } finally {
          await settings?.close();
        }
        expect(destroy).toHaveBeenCalledTimes(1);
        // Closing twice is harmless: the caller may close after an abandoned check.
        await settings?.close();
        expect(destroy).toHaveBeenCalledTimes(1);
      } finally {
        destroy.mockRestore();
      }
    });

    it('writes and removes values for the startup license check', async () => {
      const options = await open(false);
      const settings = await openPostgresStartupSettings(options);
      try {
        await settings?.upsertValue('app', 'license_key', 'first');
        await settings?.upsertValue('app', 'license_key', 'second');
        expect(await settings?.findValue('app', 'license_key')).toBe('second');
        const [stored] = await sql([`SELECT "value" FROM "setting" WHERE "parent" = 'app' AND "key" = 'license_key'`]);
        expect(stored.rows).toEqual([{ value: 'second' }]);
        await settings?.remove('app', 'license_key');
        expect(await settings?.findValue('app', 'license_key')).toBeNull();
      } finally {
        await settings?.close();
      }
    });
  });
});
