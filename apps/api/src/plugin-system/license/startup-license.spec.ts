import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfigType } from '../../config/app.config';
import { EncryptionService } from '../../encryption/encryption.service';
import { NON_PROFIT_LICENSE_KEY } from '../../license/license.service';
import { APP_KEYS, APP_PARENT } from '../../settings/constants';
import type { StandaloneSettingsRows } from '../../settings/settings-rows.port';
import { SettingsStoreService } from '../../settings/settings-store.service';
import { PluginService } from '../plugin.service';
import { evaluateStartupLicense, type OpenStartupSettings } from './startup-license';

jest.mock('@licenso/client', () => ({ verifyLicense: jest.fn() }));
import { verifyLicense } from '@licenso/client';

/** Settings rows in memory; `failReads` stands for a database without a settings table. */
function memorySettings(failReads = false): StandaloneSettingsRows & { close: jest.Mock } {
  const values = new Map<string, string>();
  return {
    findValue: async (parent, key) => {
      if (failReads) throw new Error('no such table: setting');
      return values.get(`${parent}.${key}`) ?? null;
    },
    upsertValue: async (parent, key, value) => {
      values.set(`${parent}.${key}`, value);
    },
    remove: async (parent, key) => {
      values.delete(`${parent}.${key}`);
    },
    close: jest.fn(async () => undefined),
  };
}

describe('evaluateStartupLicense', () => {
  const appConfig = { AUTH_SESSION_SECRET: 'secret', LICENSO_PUBLIC_KEY: 'public' } as AppConfigType;
  const logger = new Logger('test');
  let pluginsSpy: jest.SpyInstance;
  let settings: ReturnType<typeof memorySettings>;
  let openSettings: jest.MockedFunction<OpenStartupSettings>;

  const gatedPlugin = { name: 'wago', license: { modules: ['wago'] } };
  const plainPlugin = { name: 'plain' };

  const evaluate = (timeoutMs?: number) => evaluateStartupLicense(appConfig, logger, timeoutMs, openSettings);

  beforeEach(() => {
    settings = memorySettings();
    openSettings = jest.fn(async () => settings);
    pluginsSpy = jest.spyOn(PluginService, 'getPlugins').mockReturnValue([gatedPlugin, plainPlugin] as never);
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  const seed = async (licenseKey: string) => {
    const store = new SettingsStoreService(settings, new EncryptionService(new ConfigService({ app: appConfig })));
    await store.setSecretSetting(APP_PARENT, APP_KEYS.licenseKey, licenseKey);
  };

  it('skips the database and Licenso when no plugin is license-gated', async () => {
    pluginsSpy.mockReturnValue([plainPlugin] as never);
    await expect(evaluate()).resolves.toBeNull();
    expect(openSettings).not.toHaveBeenCalled();
    expect(verifyLicense).not.toHaveBeenCalled();
  });

  describe('on a fresh install (no database yet)', () => {
    const env = { ...process.env };
    beforeEach(() => openSettings.mockResolvedValue(null));
    afterEach(() => {
      process.env = { ...env };
    });

    it('reports no license when LICENSE_KEY is not set', async () => {
      delete process.env.LICENSE_KEY;
      await expect(evaluate()).resolves.toEqual({ valid: false, modules: [] });
    });

    it('uses LICENSE_KEY from the environment, which the seed migration stores later', async () => {
      process.env.LICENSE_KEY = '  licenso-key  ';
      process.env.ATTRACCESS_URL = 'https://attraccess.example';
      (verifyLicense as jest.Mock).mockResolvedValue({
        valid: true,
        payload: { cfg: { modules: { wago: true }, usageLimits: {} } },
      });
      await expect(evaluate()).resolves.toEqual({ valid: true, modules: ['wago'] });
      expect(verifyLicense).toHaveBeenCalledWith('licenso-key', 'public', 'attraccess.example');
    });
  });

  it('reports no modules for an invalid (for example expired) key and closes the connection', async () => {
    await seed('licenso-key');
    (verifyLicense as jest.Mock).mockResolvedValue({
      valid: false,
      reason: 'Expired',
      payload: { cfg: { modules: { wago: true }, usageLimits: {} } },
    });
    await expect(evaluate()).resolves.toEqual({ valid: false, modules: [] });
    expect(settings.close).toHaveBeenCalledTimes(1);
  });

  it('gives up after the timeout and still closes the connection', async () => {
    await seed('licenso-key');
    let finish: (value: unknown) => void = () => undefined;
    (verifyLicense as jest.Mock).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await expect(evaluate(20)).resolves.toBeNull();
    expect(settings.close).not.toHaveBeenCalled();
    finish({ valid: true, payload: { cfg: { modules: { wago: true } } } });
    // The connection closes once the abandoned check settles; wait for it instead of a fixed delay.
    for (let attempt = 0; attempt < 200 && settings.close.mock.calls.length === 0; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(settings.close).toHaveBeenCalled();
  });

  it('gives up after the timeout while the connection is still opening', async () => {
    let opened: (rows: StandaloneSettingsRows | null) => void = () => undefined;
    openSettings.mockReturnValue(new Promise((resolve) => (opened = resolve)));
    await expect(evaluate(20)).resolves.toBeNull();
    opened(settings);
    for (let attempt = 0; attempt < 200 && settings.close.mock.calls.length === 0; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(settings.close).toHaveBeenCalled();
  });

  it('reports an invalid license when no license key is stored', async () => {
    await expect(evaluate()).resolves.toEqual({ valid: false, modules: [] });
  });

  it('reads the encrypted key and resolves the non-profit license without plugin modules', async () => {
    await seed(NON_PROFIT_LICENSE_KEY);
    const snapshot = await evaluate();
    expect(snapshot?.valid).toBe(true);
    expect(snapshot?.modules).not.toContain('wago');
  });

  it('returns the modules of a Licenso license', async () => {
    await seed('licenso-key');
    (verifyLicense as jest.Mock).mockResolvedValue({
      valid: true,
      payload: { cfg: { modules: { wago: true }, usageLimits: {} } },
    });
    await expect(evaluate()).resolves.toEqual({ valid: true, modules: ['wago'] });
  });

  it('never throws on a Licenso error', async () => {
    await seed('licenso-key');
    (verifyLicense as jest.Mock).mockRejectedValue(new Error('network down'));
    await expect(evaluate()).resolves.toBeNull();
  });

  it('never throws when the settings cannot be read (for example a missing settings table)', async () => {
    settings = memorySettings(true);
    await expect(evaluate()).resolves.toBeNull();
    expect(settings.close).toHaveBeenCalled();
  });

  it('never throws when the connection cannot be opened', async () => {
    openSettings.mockRejectedValue(new Error('SQLITE_CANTOPEN'));
    await expect(evaluate()).resolves.toBeNull();
  });
});
