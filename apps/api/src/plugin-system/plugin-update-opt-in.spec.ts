import { Logger } from '@nestjs/common';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { NpmPluginService } from './npm-plugin.service';
import { setupNpmPluginFixture } from './npm-plugin.test-fixture';
import { DEFAULT_PLUGIN_UPDATE_POLICY } from './npm/update-policy';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));

/** What a host that is upgraded keeps from before automatic updates became opt-in, and what booting makes of it. */
describe('upgrading to opt-in automatic plugin updates', () => {
  const fixture = setupNpmPluginFixture();
  const statePath = () => join(fixture.root, '.npm-plugin-state.json');
  const stored = () => JSON.parse(readFileSync(statePath(), 'utf8')) as Array<Record<string, unknown>>;
  const overrides = () => Object.fromEntries(stored().map((record) => [record.name, record.updateOverride]));

  const record = (name: string, updateOverride?: string) => ({
    name,
    version: '1.0.0',
    requestedSpec: 'latest',
    registryId: 'npm',
    registryUrl: 'https://registry.npmjs.org',
    integrity: 'sha512-test',
    installPath: `npm-${name}`,
    permissions: [],
    lastError: null,
    ...(updateOverride ? { updateOverride } : {}),
  });

  function host(policy?: object) {
    const settings: Record<string, string> = policy ? { 'update-policy': JSON.stringify(policy) } : {};
    const store = {
      getPlainSetting: jest.fn(async (_parent: string, key: string) => settings[key]),
      setPlainSetting: jest.fn(async (_parent: string, key: string, value: string) => {
        settings[key] = value;
      }),
    };
    const boot = async () => {
      const service = new NpmPluginService(store as never);
      await service.onApplicationBootstrap();
      return service;
    };
    return { boot, store, settings };
  }

  const legacyPolicy = {
    checksEnabled: false,
    mode: 'minor',
    prerelease: false,
    maintenanceWindow: { startMinute: 180, durationMinutes: 120 },
  };

  it('switches a saved policy off, keeps the check setting and resets overrides other than inherit and off', async () => {
    writeFileSync(
      statePath(),
      JSON.stringify([
        record('follows', 'follow'),
        record('patches', 'patch'),
        record('minors', 'minor'),
        record('stays-off', 'off'),
        record('inherits', 'inherit'),
        record('unset'),
      ]),
    );
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { boot, settings } = host(legacyPolicy);

    const service = await boot();

    expect(JSON.parse(settings['update-policy'])).toMatchObject({ automaticUpdates: false, checksEnabled: false });
    expect(overrides()).toEqual({
      follows: 'inherit',
      patches: 'inherit',
      minors: 'inherit',
      'stays-off': 'off',
      inherits: 'inherit',
      unset: 'inherit',
    });
    expect(service.listInstalled()).toHaveLength(6);
    expect(warn.mock.calls.map(([message]) => String(message))).toEqual([
      expect.stringContaining('follows (follow), patches (patch), minors (minor)'),
      expect.stringContaining('has automatic updates off'),
    ]);

    // It happens once: the next boot has nothing left to reset and says nothing.
    warn.mockClear();
    await boot();
    expect(warn).not.toHaveBeenCalled();
  });

  it('never resets what a plugin manager sets after the upgrade', async () => {
    writeFileSync(statePath(), JSON.stringify([record('plugin', 'follow')]));
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { boot } = host(legacyPolicy);
    const service = await boot();

    await service.updateOverride('plugin', 'follow');
    await service.setUpdatePolicy({ automaticUpdates: true, schedule: { weekdays: [1] } });
    const restarted = await boot();

    expect(overrides()).toEqual({ plugin: 'follow' });
    await expect(restarted.getUpdatePolicy()).resolves.toMatchObject({ automaticUpdates: true });
  });

  it('treats earlier records as reset even before the boot has written it down', () => {
    writeFileSync(statePath(), JSON.stringify([record('plugin', 'follow')]));
    expect(new NpmPluginService({} as never).listInstalled()[0].updateOverride).toBe('inherit');
  });

  it('gives a fresh host the defaults and writes nothing', async () => {
    const { boot, store } = host();
    const service = await boot();
    await expect(service.getUpdatePolicy()).resolves.toEqual(DEFAULT_PLUGIN_UPDATE_POLICY);
    expect(store.setPlainSetting).not.toHaveBeenCalled();
  });

  it('still boots when the settings cannot be written, with automatic updates off all the same', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { boot, store } = host(legacyPolicy);
    store.setPlainSetting.mockRejectedValue(new Error('read-only'));
    const service = await boot();
    await expect(service.getUpdatePolicy()).resolves.toMatchObject({ automaticUpdates: false });
  });
});
