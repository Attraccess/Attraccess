import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import * as semver from 'semver';
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

  describe('paid plugins (wago, reservations)', () => {
    const readJson = (path: string) => JSON.parse(readFileSync(join(__dirname, '../../../../plugins', path), 'utf8'));

    it.each(['wago', 'reservations'])('the shipped %s plugin declares its own paid module', (name) => {
      const manifest = readJson(`${name}/plugin.json`);
      const pkg = readJson(`${name}/package.json`);
      expect(manifest.license).toEqual({ required: true, modules: [name] });
      expect(pkg.attraccess.license).toEqual(manifest.license);
      expect(pkg.license).toBe('SEE LICENSE IN LICENSE.md');
      // 1.11.0-beta.1 and beta.2 shipped without license enforcement and ignore the license block, so they must not
      // install the plugin.
      expect(semver.gte(manifest.attraccessVersion.min, '1.11.0-beta.3')).toBe(true);
      expect(pkg.attraccess.host).toBe(`^${manifest.attraccessVersion.min}`);
      expect(readFileSync(join(__dirname, '../../../../plugins', name, 'LICENSE.md'), 'utf8')).toContain(`\`${name}\``);
    });

    it.each([
      ['reservations', ['reservations'], ['reservations']],
      ['wago', ['wago'], ['wago']],
      ['both', ['wago', 'reservations'], ['reservations', 'wago']],
      ['the non-profit key', ['attractap', 'sso', 'billing', 'maintenance'], []],
    ])('a license with %s loads exactly the matching paid plugins', (_label, modules, expected) => {
      fixture('wago', { required: true, modules: ['wago'] });
      fixture('reservations', { required: true, modules: ['reservations'] });
      PluginService.setLicenseSnapshot({ valid: true, modules });
      PluginModule.forRoot();
      expect(loaded().sort()).toEqual(expected);
      for (const name of ['wago', 'reservations'].filter((plugin) => !expected.includes(plugin))) {
        expect(status(name)).toMatchObject({ status: 'license_missing', error: `Requires license module: ${name}` });
      }
    });
  });

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

  it('reports only the modules the license lacks', () => {
    fixture('multi', { modules: ['wago', 'other'] });
    PluginService.setLicenseSnapshot(wagoLicense);
    PluginModule.forRoot();
    expect(status('multi')).toMatchObject({
      status: 'license_missing',
      error: 'Requires license module: other',
      missingLicenseModules: ['other'],
    });
  });

  it('does not record license_missing plugins in the boot guard, so an incomplete startup cannot quarantine them', () => {
    fixture('wago', { modules: ['wago'] });
    fixture('wago-addon', undefined, ['wago']);
    fixture('plain', undefined);
    PluginService.setLicenseSnapshot(nonProfit);
    PluginService.beginBootGuard();
    try {
      const guarded = JSON.parse(readFileSync(join(root, '.plugin-boot-guard.json'), 'utf8'));
      expect(guarded).toEqual(['plain']);

      // The next startup after a crash quarantines only what the guard recorded.
      PluginService.configure({ PLUGIN_DIR: root, RESTART_BY_EXIT: true });
      PluginService.setLicenseSnapshot(wagoLicense);
      PluginService.beginBootGuard();
      expect(PluginService.isPluginQuarantined(status('wago') as never)).toBe(false);
    } finally {
      PluginService.clearBootGuard();
    }
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

  it('runs no migrations for license_missing plugins or their (transitive) dependants', async () => {
    fixture('wago', { modules: ['wago'] }, [], true);
    fixture('addon', undefined, ['wago'], true);
    fixture('addon-extra', undefined, ['addon'], true);
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
    expect(loaded()).toEqual(['plain']);
    expect(status('addon')?.error).toContain('Required plugin wago failed to load');
    expect(status('addon-extra')?.error).toContain('Required plugin addon failed to load');
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

    it('is true when the key switches between two paid modules', () => {
      fixture('reservations', { required: true, modules: ['reservations'] });
      PluginService.setLicenseSnapshot({ valid: true, modules: ['reservations'] });
      expect(PluginService.licenseDecisionChanges({ valid: true, modules: ['wago'] })).toBe(true);
      PluginService.setLicenseSnapshot({ valid: true, modules: ['wago'] });
      expect(PluginService.licenseDecisionChanges({ valid: true, modules: ['reservations'] })).toBe(true);
    });

    it('ignores a quarantined plugin, because a restart would not load it', () => {
      fixture('reservations', { required: true, modules: ['reservations'] });
      PluginService.setLicenseSnapshot(wagoLicense);
      const reservations = PluginService.getPlugins().find((plugin) => plugin.name === 'reservations');
      PluginService.quarantinePluginDirectory(reservations.pluginDirectory, new Error('crashed'));
      expect(
        PluginService.licenseDecisionChanges({ ...wagoLicense, modules: [...wagoLicense.modules, 'reservations'] }),
      ).toBe(false);
      expect(PluginService.licenseDecisionChanges(nonProfit)).toBe(true);
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

    it('does not restart for a key that cannot be verified, because startup would abort on it', async () => {
      PluginService.setLicenseSnapshot(wagoLicense);
      const failing = make(jest.fn().mockRejectedValue(new Error('licenso down')));
      await failing.watcher.onLicenseKeyChanged();
      expect(failing.pluginService.requestRestart).not.toHaveBeenCalled();
    });

    it('does not restart for an invalid (for example expired) key', async () => {
      PluginService.setLicenseSnapshot(wagoLicense);
      const { watcher, pluginService } = make(
        jest.fn().mockResolvedValue({ valid: false, reason: 'Expired', modules: [], usageLimits: {} }),
      );
      await watcher.onLicenseKeyChanged();
      expect(pluginService.requestRestart).not.toHaveBeenCalled();
    });

    it('restarts when the key is removed while a gated plugin is loaded', async () => {
      PluginService.setLicenseSnapshot(wagoLicense);
      const { watcher, pluginService } = make(
        jest.fn().mockResolvedValue({
          valid: false,
          reason: 'LICENSE_KEY_NOT_CONFIGURED',
          modules: [],
          usageLimits: {},
          isNonProfit: false,
        }),
      );
      await watcher.onLicenseKeyChanged();
      expect(pluginService.requestRestart).toHaveBeenCalledTimes(1);
    });

    it('does not restart when the key is removed and no gated plugin was loaded', async () => {
      PluginService.setLicenseSnapshot(null);
      const { watcher, pluginService } = make(
        jest.fn().mockResolvedValue({ valid: false, reason: 'LICENSE_KEY_NOT_CONFIGURED', modules: [] }),
      );
      await watcher.onLicenseKeyChanged();
      expect(pluginService.requestRestart).not.toHaveBeenCalled();
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
