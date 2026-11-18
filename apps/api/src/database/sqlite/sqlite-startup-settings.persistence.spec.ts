import { Setting } from '@attraccess/database-entities';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { openSqliteStartupSettings } from './sqlite-startup-settings';

describe('openSqliteStartupSettings', () => {
  let directory: string;
  let options: DataSourceOptions;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'startup-settings-'));
    options = {
      type: 'better-sqlite3',
      invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
      database: join(directory, 'db.sqlite'),
    };
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  const seed = async (withTable: boolean, rows: Array<Pick<Setting, 'parent' | 'key' | 'value'>> = []) => {
    const source = await new DataSource({ ...options, entities: [Setting], synchronize: withTable }).initialize();
    try {
      if (rows.length) await source.getRepository(Setting).insert(rows);
    } finally {
      await source.destroy();
    }
  };

  it('returns null without creating a database file on a fresh install', async () => {
    await expect(openSqliteStartupSettings(options)).resolves.toBeNull();
    expect(existsSync(join(directory, 'db.sqlite'))).toBe(false);
  });

  it('reads stored settings and closes its connection', async () => {
    await seed(true, [{ parent: 'app', key: 'backend_url', value: 'https://attraccess.example' }]);
    const destroy = jest.spyOn(DataSource.prototype, 'destroy');
    const settings = await openSqliteStartupSettings(options);
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
    destroy.mockRestore();
  });

  it('fails the read, not the open, when the settings table is missing', async () => {
    await seed(false);
    const settings = await openSqliteStartupSettings(options);
    try {
      await expect(settings?.findValue('app', 'license_key')).rejects.toThrow();
    } finally {
      await settings?.close();
    }
  });
});
