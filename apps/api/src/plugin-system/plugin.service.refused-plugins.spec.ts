import { registerPluginServiceFixture } from './plugin.service.plugin-service.test-fixture';
import { BadRequestException } from '@nestjs/common';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
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

    expect(listed).toMatchObject({ name: 'legacy-plugin', status: 'error', refused: true });
    expect(listed.error).toContain('Plugin legacy-plugin');
    expect(listed.error).toContain('migrating-to-2');
    expect(PluginService.getManifestById(listed.id)).toMatchObject({ name: 'legacy-plugin' });
  });

  it('never hands a refused plugin to loading or migrations', () => {
    writeLegacyPlugin();
    fixture.writePlugin(fixture.root, 'database-access', {
      ...fixture.VALID_MANIFEST,
      name: 'database-access',
      permissions: ['DATABASE_ACCESS'],
    });

    expect(PluginService.getPlugins()).toEqual([]);
    expect(PluginService.getPluginsWithLoadStatus().map((plugin) => plugin.status)).toEqual(['error', 'error']);
    for (const plugin of PluginService.getDiscoveredPlugins()) expect(PluginService.isPluginRefused(plugin)).toBe(true);
  });

  it('refuses a plugin whose bundle imports a database package, without running it', () => {
    fixture.writePlugin(fixture.root, 'orm-plugin', { ...fixture.VALID_MANIFEST, name: 'orm-plugin' });
    mkdirSync(join(fixture.root, 'orm-plugin', 'dist'));
    writeFileSync(join(fixture.root, 'orm-plugin', 'dist', 'index.js'), "require('typeorm');");

    expect(PluginService.getPlugins()).toEqual([]);
    const [listed] = PluginService.getPluginsWithLoadStatus();
    expect(listed).toMatchObject({ name: 'orm-plugin', status: 'error' });
    expect(listed.error).toMatch(/orm-plugin.*"typeorm".*migrating-to-2/s);
  });

  it('keeps a refused 1.x copy from disabling a valid 2.0 plugin of the same name', () => {
    writeLegacyPlugin();
    fixture.writePlugin(fixture.root, 'legacy-plugin-2', { ...fixture.VALID_MANIFEST, name: 'legacy-plugin' });

    expect(PluginService.getPlugins().map((plugin) => plugin.pluginDirectory)).toEqual(['legacy-plugin-2']);
    const listed = PluginService.getPluginsWithLoadStatus();
    const statuses = Object.fromEntries(listed.map((plugin) => [plugin.pluginDirectory, plugin.status]));
    expect(statuses['legacy-plugin']).toBe('error');
    expect(statuses['legacy-plugin-2']).not.toBe('error');
    // Both copies are listed under distinct ids, and only the 1.x one is marked refused (the admin UI keys rows by id).
    const refused = Object.fromEntries(listed.map((plugin) => [plugin.pluginDirectory, plugin.refused]));
    expect(refused).toEqual({ 'legacy-plugin': true, 'legacy-plugin-2': false });
    expect(new Set(listed.map((plugin) => plugin.id)).size).toBe(2);
  });

  it('deletes a refused plugin without loading its code or dropping its tables', async () => {
    writeLegacyPlugin();
    const [plugin] = PluginService.getDiscoveredPlugins();
    const runDown = jest.spyOn(PluginMigrationService, 'dropStorage').mockResolvedValue(true);
    const ble = { deleteAllForPlugin: jest.fn().mockResolvedValue(undefined) };
    const readers = { deleteAllForPlugin: jest.fn().mockResolvedValue(undefined) };

    await new PluginUninstallService(ble as never, readers as never).deletePlugin(plugin.id);

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
