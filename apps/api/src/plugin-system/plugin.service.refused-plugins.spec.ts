import { registerPluginServiceFixture } from './plugin.service.plugin-service.test-fixture';
import { BadRequestException } from '@nestjs/common';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { PluginMigrationService } from './plugin-migration.service';
import { PluginService } from './plugin.service';
import { PluginUninstallService } from './plugin-uninstall.service';
import { zipFileUpload } from './__test__/make-zip';

/** Plugins discovery refuses (SDK 1.x, unsupported engine): listed with the reason, never run, still deletable. */
describe('PluginService refused plugins', () => {
  const fixture = registerPluginServiceFixture();

  const sdk1Manifest = {
    name: 'legacy-plugin',
    version: '1.4.0',
    main: {
      backend: { directory: 'dist', entryPoint: 'index.js' },
      migrations: { directory: 'dist', entryPoint: 'migrations.js' },
    },
    attraccessVersion: { min: '1.11.0' },
  };

  function writeLegacyPlugin() {
    fixture.writePlugin(fixture.root, 'legacy-plugin', sdk1Manifest);
  }

  it('keeps an SDK 1.x plugin listed with an error status naming the migration guide', () => {
    writeLegacyPlugin();

    const [listed] = PluginService.getPluginsWithLoadStatus();

    expect(listed).toMatchObject({ name: 'legacy-plugin', status: 'error' });
    expect(listed.error).toContain('Plugin legacy-plugin');
    expect(listed.error).toContain('migrating-to-2');
    expect(PluginService.getManifestById(listed.id)).toMatchObject({ name: 'legacy-plugin' });
  });

  it('never hands a refused plugin to loading or migrations', () => {
    writeLegacyPlugin();
    fixture.writePlugin(fixture.root, 'engine-mismatch', {
      ...fixture.VALID_MANIFEST,
      name: 'engine-mismatch',
      persistence: { backends: ['postgres'] },
      main: { ...fixture.VALID_MANIFEST.main, migrations: { directory: 'dist', entryPoint: 'migrations.js' } },
    });

    expect(PluginService.getPlugins()).toEqual([]);
    expect(PluginService.getPluginsWithLoadStatus().map((plugin) => plugin.status)).toEqual(['error', 'error']);
    for (const plugin of PluginService.getDiscoveredPlugins()) expect(PluginService.isPluginRefused(plugin)).toBe(true);
  });

  it('deletes a refused plugin without running its down() migrations', async () => {
    writeLegacyPlugin();
    const [plugin] = PluginService.getDiscoveredPlugins();
    const runDown = jest.spyOn(PluginMigrationService, 'runDownMigrations').mockResolvedValue(1);
    const ble = { deleteAllForPlugin: jest.fn().mockResolvedValue(undefined) };

    await new PluginUninstallService(new PluginService(), ble as never).deletePlugin(plugin.id, true);

    expect(runDown).not.toHaveBeenCalled();
    expect(existsSync(join(fixture.root, 'legacy-plugin'))).toBe(false);
  });

  it('refuses an SDK 1.x ZIP upload with a 400 naming the plugin and the guide, writing nothing', async () => {
    const upload = new PluginService().uploadPlugin(zipFileUpload({ 'plugin.json': JSON.stringify(sdk1Manifest) }));

    await expect(upload).rejects.toBeInstanceOf(BadRequestException);
    await expect(upload).rejects.toThrow(/Plugin legacy-plugin .*migrating-to-2/s);
    expect(readdirSync(fixture.root)).toEqual([]);
    expect(fixture.restartSpy).not.toHaveBeenCalled();
  });
});
