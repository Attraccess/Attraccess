import { Setting } from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { AppConfigType } from '../../config/app.config';
import { EncryptionService } from '../../encryption/encryption.service';
import { NON_PROFIT_LICENSE_KEY } from '../../license/license.service';
import { APP_KEYS, APP_PARENT } from '../../settings/constants';
import { SettingsStoreService } from '../../settings/settings-store.service';
import { PluginService } from '../plugin.service';
import { evaluateStartupLicense } from './startup-license';

const mockDatabase = { file: '' };
jest.mock('../../database/datasource', () => ({
  dataSourceConfig: {
    type: 'sqlite',
    get database() {
      return mockDatabase.file;
    },
    entities: [],
    migrations: [],
  },
}));
jest.mock('@licenso/client', () => ({ verifyLicense: jest.fn() }));
import { verifyLicense } from '@licenso/client';

describe('evaluateStartupLicense', () => {
  const appConfig = { AUTH_SESSION_SECRET: 'secret', LICENSO_PUBLIC_KEY: 'public' } as AppConfigType;
  const logger = new Logger('test');
  let dir: string;
  let pluginsSpy: jest.SpyInstance;

  const gatedPlugin = { name: 'wago', license: { modules: ['wago'] } };
  const plainPlugin = { name: 'plain' };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'startup-license-'));
    mockDatabase.file = join(dir, 'db.sqlite');
    pluginsSpy = jest.spyOn(PluginService, 'getPlugins').mockReturnValue([gatedPlugin, plainPlugin] as never);
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  const seed = async (licenseKey: string | null, withTable = true) => {
    const dataSource = new DataSource({
      type: 'sqlite',
      database: mockDatabase.file,
      entities: [Setting],
      synchronize: withTable,
    });
    await dataSource.initialize();
    try {
      if (licenseKey) {
        const store = new SettingsStoreService(
          dataSource.getRepository(Setting),
          new EncryptionService(new ConfigService({ app: appConfig })),
        );
        await store.setSecretSetting(APP_PARENT, APP_KEYS.licenseKey, licenseKey);
      }
    } finally {
      await dataSource.destroy();
    }
  };

  it('skips the database and Licenso when no plugin is license-gated', async () => {
    pluginsSpy.mockReturnValue([plainPlugin] as never);
    await expect(evaluateStartupLicense(appConfig, logger)).resolves.toBeNull();
    expect(verifyLicense).not.toHaveBeenCalled();
  });

  describe('on a fresh install (no database yet)', () => {
    const env = { ...process.env };
    afterEach(() => {
      process.env = { ...env };
    });

    it('reports no license without creating a database when LICENSE_KEY is not set', async () => {
      delete process.env.LICENSE_KEY;
      await expect(evaluateStartupLicense(appConfig, logger)).resolves.toEqual({ valid: false, modules: [] });
      expect(require('fs').existsSync(mockDatabase.file)).toBe(false);
    });

    it('uses LICENSE_KEY from the environment, which the seed migration stores later', async () => {
      process.env.LICENSE_KEY = '  licenso-key  ';
      process.env.ATTRACCESS_URL = 'https://attraccess.example';
      (verifyLicense as jest.Mock).mockResolvedValue({
        valid: true,
        payload: { cfg: { modules: { wago: true }, usageLimits: {} } },
      });
      await expect(evaluateStartupLicense(appConfig, logger)).resolves.toEqual({ valid: true, modules: ['wago'] });
      expect(verifyLicense).toHaveBeenCalledWith('licenso-key', 'public', 'attraccess.example');
      expect(require('fs').existsSync(mockDatabase.file)).toBe(false);
    });
  });

  it('reports no modules for an invalid (for example expired) key', async () => {
    await seed('licenso-key');
    (verifyLicense as jest.Mock).mockResolvedValue({
      valid: false,
      reason: 'Expired',
      payload: { cfg: { modules: { wago: true }, usageLimits: {} } },
    });
    await expect(evaluateStartupLicense(appConfig, logger)).resolves.toEqual({ valid: false, modules: [] });
  });

  it('gives up after the timeout and still closes the connection', async () => {
    await seed('licenso-key');
    let finish: (value: unknown) => void = () => undefined;
    (verifyLicense as jest.Mock).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const destroy = jest.spyOn(DataSource.prototype, 'destroy');
    await expect(evaluateStartupLicense(appConfig, logger, 20)).resolves.toBeNull();
    finish({ valid: true, payload: { cfg: { modules: { wago: true } } } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(destroy).toHaveBeenCalled();
  });

  it('reports an invalid license when no license key is stored', async () => {
    await seed(null);
    await expect(evaluateStartupLicense(appConfig, logger)).resolves.toEqual({ valid: false, modules: [] });
  });

  it('reads the encrypted key and resolves the non-profit license without plugin modules', async () => {
    await seed(NON_PROFIT_LICENSE_KEY);
    const snapshot = await evaluateStartupLicense(appConfig, logger);
    expect(snapshot?.valid).toBe(true);
    expect(snapshot?.modules).not.toContain('wago');
  });

  it('returns the modules of a Licenso license', async () => {
    await seed('licenso-key');
    (verifyLicense as jest.Mock).mockResolvedValue({
      valid: true,
      payload: { cfg: { modules: { wago: true }, usageLimits: {} } },
    });
    await expect(evaluateStartupLicense(appConfig, logger)).resolves.toEqual({ valid: true, modules: ['wago'] });
  });

  it('never throws on a Licenso error', async () => {
    await seed('licenso-key');
    (verifyLicense as jest.Mock).mockRejectedValue(new Error('network down'));
    await expect(evaluateStartupLicense(appConfig, logger)).resolves.toBeNull();
  });

  it('never throws when the settings table is missing', async () => {
    await seed(null, false);
    await expect(evaluateStartupLicense(appConfig, logger)).resolves.toBeNull();
  });
});
