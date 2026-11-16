import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { PluginModule } from '../plugin.module';
import { PluginService } from '../plugin.service';
import { PluginMigrationService } from '../plugin-migration.service';
import { PluginLicenseWatcher } from './plugin-license-watcher.service';

type License = Record<string, unknown> | undefined;

describe('plugin license gate', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'plugin-license-'));
    PluginService.configure({ PLUGIN_DIR: root, RESTART_BY_EXIT: true });
    PluginModule.configure({ DISABLE_PLUGINS: false });
  });
  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  const fixture = (name: string, license: License, dependencies: string[] = [], migrations = false) => {
    mkdirSync(join(root, name, 'dist'), { recursive: true });
    writeFileSync(
      join(root, name, 'plugin.json'),
      JSON.stringify({
        name,
        version: '1.0.0',
        attraccessVersion: { min: '1.0.0' },
        dependencies: dependencies.map((dependency) => ({ name: dependency, version: '^1.0.0', required: true })),
        ...(license === undefined ? {} : { license }),
        main: {
          backend: { directory: 'dist', entryPoint: 'index.js' },
          ...(migrations ? { migrations: { directory: 'dist', entryPoint: 'migrations.js' } } : {}),
        },
      }),
    );
    writeFileSync(
      join(root, name, 'dist', 'index.js'),
      String.raw`
        require('fs').appendFileSync(${JSON.stringify(join(root, '.loaded'))}, ${JSON.stringify(name)} + '\n');
        module.exports = { default: { register: () => ({ module: class TestModule {} }) } };
      `,
    );
  };
  const loaded = () =>
    existsSync(join(root, '.loaded')) ? readFileSync(join(root, '.loaded'), 'utf8').trim().split('\n') : [];
  const status = (name: string) => PluginService.getPluginsWithLoadStatus().find((plugin) => plugin.name === name);

  const nonProfit = { valid: true, modules: ['attractap', 'sso', 'billing', 'maintenance'] };
  const wagoLicense = { valid: true, modules: ['attractap', 'wago'] };

  it('loads a module plugin with the module and keeps ungated plugins loading', () => {
    fixture('wago', { required: true, modules: ['wago'] });
    fixture('plain', undefined);
    PluginService.setLicenseSnapshot(wagoLicense);
    PluginModule.forRoot();
    expect(loaded().sort()).toEqual(['plain', 'wago']);
    expect(status('wago')).toMatchObject({ status: 'loaded', error: null });
  });

  it.each([
    ['the non-profit key', nonProfit],
    ['a license without the module', { valid: true, modules: ['attractap'] }],
    ['an invalid license', { valid: false, modules: ['wago'] }],
    ['no determinable license', null],
  ])('does not load a module plugin with %s and reports license_missing', (_label, snapshot) => {
    fixture('wago', { required: true, modules: ['wago'] });
    fixture('plain', undefined);
    PluginService.setLicenseSnapshot(snapshot);
    PluginModule.forRoot();
    expect(loaded()).toEqual(['plain']);
    expect(status('wago')).toMatchObject({ status: 'license_missing', error: 'Requires license module: wago' });
    expect(status('plain')?.status).toBe('loaded');
  });

  it('writes no quarantine and loads the plugin once it is licensed after a restart', () => {
    fixture('wago', { modules: ['wago'] });
    PluginService.setLicenseSnapshot(nonProfit);
    PluginModule.forRoot();
    expect(PluginService.isPluginQuarantined(status('wago') as never)).toBe(false);
    expect(existsSync(join(root, '.plugin-failures.json'))).toBe(false);

    // A restart re-discovers and re-evaluates.
    PluginService.configure({ PLUGIN_DIR: root, RESTART_BY_EXIT: true });
    PluginService.setLicenseSnapshot(wagoLicense);
    PluginModule.forRoot();
    expect(loaded()).toEqual(['wago']);
    expect(status('wago')?.status).toBe('loaded');
  });

  it('loads a required-only plugin with the non-profit key but not without a valid license', () => {
    fixture('needs-license', { required: true });
    PluginService.setLicenseSnapshot(nonProfit);
    PluginModule.forRoot();
    expect(status('needs-license')?.status).toBe('loaded');

    PluginService.configure({ PLUGIN_DIR: root, RESTART_BY_EXIT: true });
    PluginService.setLicenseSnapshot({ valid: false, modules: [] });
    PluginModule.forRoot();
    expect(status('needs-license')).toMatchObject({
      status: 'license_missing',
      error: 'Requires a valid Attraccess license',
    });
  });

  it('does not load dependants of a license_missing plugin and uses the dependency message', () => {
    fixture('wago', { modules: ['wago'] });
    fixture('addon', undefined, ['wago']);
    PluginService.setLicenseSnapshot(nonProfit);
    PluginModule.forRoot();
    expect(loaded()).toEqual([]);
    expect(status('addon')).toMatchObject({
      status: 'error',
      error: expect.stringContaining('Required plugin wago failed to load'),
    });
  });

  it('runs no migrations for license_missing plugins or their dependants', async () => {
    fixture('wago', { modules: ['wago'] }, [], true);
    fixture('addon', undefined, ['wago'], true);
    fixture('plain', undefined, [], true);
    const migrated: string[] = [];
    jest.spyOn(PluginMigrationService, 'runUpMigrations').mockImplementation(async (manifest) => {
      migrated.push(manifest.name);
      return 0;
    });
    PluginService.setLicenseSnapshot(nonProfit);
    await PluginMigrationService.runPendingUpMigrationsForAllPlugins();
    expect(migrated).toEqual(['plain']);
    PluginModule.forRoot();
    expect(status('addon')?.error).toContain('Required plugin wago failed to load');
  });

  it('does not load a plugin with an invalid license block', () => {
    fixture('broken', { required: 'yes' });
    fixture('plain', undefined);
    PluginService.setLicenseSnapshot(wagoLicense);
    PluginModule.forRoot();
    expect(loaded()).toEqual(['plain']);
    expect(status('broken')).toBeUndefined();
  });

  it('shows plugins as unknown rather than license_missing while plugins are disabled', () => {
    fixture('wago', { modules: ['wago'] });
    PluginModule.configure({ DISABLE_PLUGINS: true });
    PluginModule.forRoot();
    expect(status('wago')?.status).toBe('unknown');
  });

  describe('licenseDecisionChanges', () => {
    beforeEach(() => {
      fixture('wago', { modules: ['wago'] });
      fixture('needs-license', { required: true });
      fixture('plain', undefined);
    });

    it('is true when a gated plugin starts to load or must stop loading', () => {
      PluginService.setLicenseSnapshot(nonProfit);
      expect(PluginService.licenseDecisionChanges(wagoLicense)).toBe(true);
      PluginService.configure({ PLUGIN_DIR: root, RESTART_BY_EXIT: true });
      PluginService.setLicenseSnapshot(wagoLicense);
      expect(PluginService.licenseDecisionChanges(nonProfit)).toBe(true);
      expect(PluginService.licenseDecisionChanges(null)).toBe(true);
    });

    it('is false when no gated plugin changes its decision', () => {
      PluginService.setLicenseSnapshot(nonProfit);
      expect(PluginService.licenseDecisionChanges({ valid: true, modules: ['sso'] })).toBe(false);
      expect(PluginService.licenseDecisionChanges(nonProfit)).toBe(false);
    });

    it('is false without a startup evaluation (plugins disabled)', () => {
      expect(PluginService.licenseDecisionChanges(wagoLicense)).toBe(false);
    });
  });

  describe('PluginLicenseWatcher', () => {
    const make = (getLicenseData: jest.Mock) => {
      const pluginService = { requestRestart: jest.fn() };
      const watcher = new PluginLicenseWatcher({ get: () => ({ getLicenseData }) } as never, pluginService as never);
      return { watcher, pluginService };
    };

    beforeEach(() => {
      fixture('wago', { modules: ['wago'] });
    });

    it('restarts when the new key changes a load decision', async () => {
      PluginService.setLicenseSnapshot(nonProfit);
      const { watcher, pluginService } = make(jest.fn().mockResolvedValue({ ...wagoLicense, usageLimits: {} }));
      await watcher.onLicenseKeyChanged();
      expect(pluginService.requestRestart).toHaveBeenCalledTimes(1);
    });

    it('does not restart when no decision changes', async () => {
      PluginService.setLicenseSnapshot(nonProfit);
      const { watcher, pluginService } = make(jest.fn().mockResolvedValue({ valid: true, modules: ['sso'] }));
      await watcher.onLicenseKeyChanged();
      expect(pluginService.requestRestart).not.toHaveBeenCalled();
    });

    it('treats an unverifiable key as no license: restarts only if wago was loaded before', async () => {
      PluginService.setLicenseSnapshot(wagoLicense);
      const failing = make(jest.fn().mockRejectedValue(new Error('licenso down')));
      await failing.watcher.onLicenseKeyChanged();
      expect(failing.pluginService.requestRestart).toHaveBeenCalledTimes(1);

      PluginService.setLicenseSnapshot(nonProfit);
      const idle = make(jest.fn().mockRejectedValue(new Error('licenso down')));
      await idle.watcher.onLicenseKeyChanged();
      expect(idle.pluginService.requestRestart).not.toHaveBeenCalled();
    });

    it('never restarts while plugins are disabled', async () => {
      PluginService.setLicenseSnapshot(nonProfit);
      PluginModule.configure({ DISABLE_PLUGINS: true });
      const { watcher, pluginService } = make(jest.fn().mockResolvedValue(wagoLicense));
      await watcher.onLicenseKeyChanged();
      expect(pluginService.requestRestart).not.toHaveBeenCalled();
    });
  });
});
