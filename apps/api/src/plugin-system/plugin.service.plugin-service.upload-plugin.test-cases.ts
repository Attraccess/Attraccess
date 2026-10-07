import { BadRequestException } from '@nestjs/common';
import { existsSync, readFileSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { zipFileUpload } from './__test__/make-zip';
import { PluginService } from './plugin.service';
import { registerPluginServiceFixture } from './plugin.service.plugin-service.test-fixture';

export function registerUploadPluginCases(fixture: ReturnType<typeof registerPluginServiceFixture>) {
  describe('uploadPlugin', () => {
    it('rejects a non-zip upload', async () => {
      const service = new PluginService();
      const file = zipFileUpload({ 'plugin.json': '{}' }, { mimetype: 'text/plain' });
      await expect(service.uploadPlugin(file)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('unpacks a valid plugin, moves it into place and schedules a restart', async () => {
      const service = new PluginService();
      const file = zipFileUpload({ 'plugin.json': JSON.stringify(fixture.VALID_MANIFEST) });

      const manifest = await service.uploadPlugin(file);

      expect(manifest.name).toBe('uploaded-plugin');
      expect(existsSync(join(fixture.root, 'uploaded-plugin', 'plugin.json'))).toBe(true);
      expect(fixture.restartSpy).not.toHaveBeenCalled();
      fixture.flushScheduledRestart();
      expect(fixture.restartSpy).toHaveBeenCalledTimes(1);
    });

    it('clears stale quarantine state for an uploaded replacement', async () => {
      fixture.writePlugin(fixture.root, 'uploaded-plugin', fixture.VALID_MANIFEST);
      const [previous] = PluginService.getPlugins();
      PluginService.quarantinePlugin(previous, new Error('prior crash'));
      rmSync(join(fixture.root, 'uploaded-plugin'), { recursive: true, force: true });
      PluginService.configure({ PLUGIN_DIR: fixture.root, RESTART_BY_EXIT: true });

      await new PluginService().uploadPlugin(zipFileUpload({ 'plugin.json': JSON.stringify(fixture.VALID_MANIFEST) }));
      PluginService.configure({ PLUGIN_DIR: fixture.root, RESTART_BY_EXIT: true });

      expect(PluginService.isPluginQuarantined(PluginService.getPlugins()[0])).toBe(false);
    });

    // Finder ("Compress" on an unpacked folder) and most GUI zip tools wrap the
    // contents in a single top-level folder. Before, that surfaced as a raw
    // ENOENT on <temp>/plugin.json.
    it('unpacks a plugin whose contents sit in a single wrapper folder', async () => {
      const service = new PluginService();
      const file = zipFileUpload({
        'plugin-example/plugin.json': JSON.stringify(fixture.VALID_MANIFEST),
        'plugin-example/dist/index.js': 'module.exports = {};',
        '__MACOSX/._plugin.json': 'junk',
      });

      const manifest = await service.uploadPlugin(file);

      expect(manifest.name).toBe('uploaded-plugin');
      expect(existsSync(join(fixture.root, 'uploaded-plugin', 'plugin.json'))).toBe(true);
      expect(existsSync(join(fixture.root, 'uploaded-plugin', 'dist', 'index.js'))).toBe(true);
      expect(existsSync(join(fixture.root, 'temp'))).toBe(true);
      expect(readdirSync(join(fixture.root, 'temp'))).toEqual([]);
    });

    it('rejects a zip without a plugin.json instead of throwing ENOENT', async () => {
      const service = new PluginService();
      const file = zipFileUpload({ 'dist/index.js': 'module.exports = {};' });

      await expect(service.uploadPlugin(file)).rejects.toThrow(/plugin\.json/);
    });

    it('rejects a file that cannot be extracted', async () => {
      const service = new PluginService();
      const file = zipFileUpload({ 'plugin.json': '{}' }, { buffer: Buffer.from('not a zip at all') });

      await expect(service.uploadPlugin(file)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('cleans up the temp folder when the upload is rejected', async () => {
      const service = new PluginService();
      const file = zipFileUpload({ 'plugin.json': JSON.stringify({ name: 'x' }) });

      await expect(service.uploadPlugin(file)).rejects.toBeDefined();
      expect(readdirSync(join(fixture.root, 'temp'))).toEqual([]);
    });

    it('rejects a manifest that fails schema validation', async () => {
      const service = new PluginService();
      const file = zipFileUpload({ 'plugin.json': JSON.stringify({ name: 'x' }) });
      await expect(service.uploadPlugin(file)).rejects.toBeDefined();
    });

    it('replaces an uploaded plugin with the same name', async () => {
      const service = new PluginService();
      await service.uploadPlugin(
        zipFileUpload({
          'plugin.json': JSON.stringify(fixture.VALID_MANIFEST),
          'dist/index.js': 'module.exports = "old";',
        }),
      );

      const updatedManifest = { ...fixture.VALID_MANIFEST, version: '1.2.4' };
      const manifest = await service.uploadPlugin(
        zipFileUpload({
          'plugin.json': JSON.stringify(updatedManifest),
          'dist/index.js': 'module.exports = "new";',
        }),
      );

      expect(manifest.version).toBe('1.2.4');
      expect(readFileSync(join(fixture.root, 'uploaded-plugin', 'dist', 'index.js'), 'utf8')).toBe(
        'module.exports = "new";',
      );
      expect(readdirSync(fixture.root).filter((entry) => entry.startsWith('.uploaded-plugin-'))).toEqual([]);
    });

    it.each(['../outside-plugin', 'nested/plugin', '..\\outside-plugin'])(
      'rejects a plugin name that escapes its directory: %s',
      async (name) => {
        const service = new PluginService();
        const manifest = { ...fixture.VALID_MANIFEST, name };

        await expect(service.uploadPlugin(zipFileUpload({ 'plugin.json': JSON.stringify(manifest) }))).rejects.toThrow(
          'Plugin name must be a visible single path segment',
        );
        expect(existsSync(join(fixture.root, 'outside-plugin'))).toBe(false);
      },
    );

    it('rejects a dot-prefixed plugin name that discovery would skip', async () => {
      const service = new PluginService();
      const manifest = { ...fixture.VALID_MANIFEST, name: '.hidden-plugin' };

      await expect(service.uploadPlugin(zipFileUpload({ 'plugin.json': JSON.stringify(manifest) }))).rejects.toThrow(
        'Plugin name must be a visible single path segment',
      );
      expect(existsSync(join(fixture.root, '.hidden-plugin'))).toBe(false);
    });

    it('serializes plugin updates with the same name', async () => {
      const withPluginUploadLock = Reflect.get(PluginService, 'withPluginUploadLock') as <T>(
        name: string,
        action: () => Promise<T>,
      ) => Promise<T>;
      let releaseFirst!: () => void;
      const order: string[] = [];
      const first = withPluginUploadLock('uploaded-plugin', async () => {
        order.push('first-start');
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
        order.push('first-end');
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      const second = withPluginUploadLock('uploaded-plugin', async () => {
        order.push('second');
      });

      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(order).toEqual(['first-start']);
      releaseFirst();
      await Promise.all([first, second]);
      expect(order).toEqual(['first-start', 'first-end', 'second']);
    });
  });
}
