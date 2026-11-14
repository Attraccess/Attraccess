import { registerPluginServiceFixture } from './plugin.service.plugin-service.test-fixture';
import { NotFoundException } from '@nestjs/common';
import { existsSync } from 'fs';
import { join } from 'path';
import { PluginMigrationService } from './plugin-migration.service';
import { PluginService } from './plugin.service';
import { PluginUninstallService } from './plugin-uninstall.service';

describe('PluginUninstallService', () => {
  const fixture = registerPluginServiceFixture();

  const uninstaller = () => new PluginUninstallService(new PluginService());

  function writeDeletablePlugin(migrations?: { directory: string; entryPoint: string }) {
    fixture.writePlugin(fixture.root, 'delete-me', {
      name: 'delete-me',
      version: '1.0.0',
      main: { backend: { directory: 'dist', entryPoint: 'index.js' }, migrations },
      attraccessVersion: { min: '1.0.0' },
    });
    const [plugin] = PluginService.getPlugins();
    return plugin;
  }

  it('throws when the plugin id is unknown', async () => {
    await expect(uninstaller().deletePlugin('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('removes the plugin folder and schedules a restart', async () => {
    const plugin = writeDeletablePlugin();
    PluginService.quarantinePlugin(plugin, new Error('prior crash'));

    await uninstaller().deletePlugin(plugin.id);

    expect(existsSync(join(fixture.root, 'delete-me'))).toBe(false);
    expect(PluginService.isPluginQuarantined(plugin)).toBe(false);
    fixture.flushScheduledRestart();
    expect(fixture.restartSpy).toHaveBeenCalledTimes(1);
  });

  it('reverts the plugin migrations while its bundle is still on disk', async () => {
    const plugin = writeDeletablePlugin({ directory: 'dist', entryPoint: 'migrations.js' });
    const folder = join(fixture.root, 'delete-me');
    const runDown = jest
      .spyOn(PluginMigrationService, 'runDownMigrations')
      .mockImplementation(async () => (existsSync(folder) ? 1 : 0));

    await uninstaller().deletePlugin(plugin.id, true);

    expect(runDown).toHaveBeenCalledWith(expect.objectContaining({ name: 'delete-me' }));
    await expect(runDown.mock.results[0].value).resolves.toBe(1);
    expect(existsSync(folder)).toBe(false);
  });

  it('still removes the plugin when reverting its migrations fails', async () => {
    const plugin = writeDeletablePlugin({ directory: 'dist', entryPoint: 'migrations.js' });
    jest.spyOn(PluginMigrationService, 'runDownMigrations').mockRejectedValue(new Error('migration failed'));

    await uninstaller().deletePlugin(plugin.id, true);

    expect(existsSync(join(fixture.root, 'delete-me'))).toBe(false);
  });
});
