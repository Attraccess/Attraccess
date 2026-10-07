import { NotFoundException } from '@nestjs/common';
import { existsSync } from 'fs';
import { join } from 'path';
import { PluginService } from './plugin.service';
import { registerPluginServiceFixture } from './plugin.service.plugin-service.test-fixture';

export function registerDeletePluginCases(fixture: ReturnType<typeof registerPluginServiceFixture>) {
  describe('deletePlugin', () => {
    it('throws when the plugin id is unknown', async () => {
      const service = new PluginService();
      await expect(service.deletePlugin('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('removes the plugin folder and schedules a restart', async () => {
      fixture.writePlugin(fixture.root, 'delete-me', {
        name: 'delete-me',
        version: '1.0.0',
        main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
        attraccessVersion: { min: '1.0.0' },
      });
      const [plugin] = PluginService.getPlugins();
      PluginService.quarantinePlugin(plugin, new Error('prior crash'));
      const service = new PluginService();

      await service.deletePlugin(plugin.id);

      expect(existsSync(join(fixture.root, 'delete-me'))).toBe(false);
      expect(PluginService.isPluginQuarantined(plugin)).toBe(false);
      fixture.flushScheduledRestart();
      expect(fixture.restartSpy).toHaveBeenCalledTimes(1);
    });
  });
}

export function registerGetManifestByIdToManifestInfoCases(fixture: ReturnType<typeof registerPluginServiceFixture>) {
  describe('getManifestById / toManifestInfo', () => {
    it('finds a discovered plugin by id and returns undefined for unknown ids', () => {
      fixture.writePlugin(fixture.root, 'find-me', {
        name: 'find-me',
        version: '1.0.0',
        main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
        attraccessVersion: { min: '1.0.0' },
      });

      const [plugin] = PluginService.getPlugins();
      expect(PluginService.getManifestById(plugin.id)).toBe(plugin);
      expect(PluginService.getManifestById('missing')).toBeUndefined();
    });

    it('projects a manifest down to its public info shape', () => {
      const info = PluginService.toManifestInfo({
        id: 'abc',
        name: 'n',
        version: '2.0.0',
        pluginDirectory: 'dir',
        permissions: [],
      } as never);
      expect(info).toEqual({ id: 'abc', name: 'n', version: '2.0.0', pluginDirectory: 'dir' });
    });
  });
}

export function registerRestartAppCases(fixture: ReturnType<typeof registerPluginServiceFixture>) {
  describe('restartApp', () => {
    it('restarts by exiting when RESTART_BY_EXIT is set', () => {
      fixture.restartSpy.mockRestore();
      PluginService.configure({ PLUGIN_DIR: fixture.root, RESTART_BY_EXIT: true });
      expect(() => (new PluginService() as unknown as { restartApp: () => void }).restartApp()).toThrow('process.exit');
      expect(fixture.exitSpy).toHaveBeenCalled();
      expect(fixture.mockSpawn).not.toHaveBeenCalled();
    });

    it('respawns a detached process when RESTART_BY_EXIT is not set', () => {
      fixture.restartSpy.mockRestore();
      PluginService.configure({ PLUGIN_DIR: fixture.root, RESTART_BY_EXIT: false });
      expect(() => (new PluginService() as unknown as { restartApp: () => void }).restartApp()).toThrow('process.exit');
      expect(fixture.mockSpawn).toHaveBeenCalledWith(
        process.argv[0],
        process.argv.slice(1),
        expect.objectContaining({ detached: true }),
      );
      expect(fixture.exitSpy).toHaveBeenCalled();
    });
  });
}
