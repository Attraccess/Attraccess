import { registerPluginServiceFixture } from './plugin.service.plugin-service.test-fixture';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { PluginService } from './plugin.service';
import { zipFileUpload } from './__test__/make-zip';

describe('PluginService', () => {
  const fixture = registerPluginServiceFixture();

  describe('discovery', () => {
    it('ignores an orphaned npm directory when the same plugin is installed manually', () => {
      fixture.writePlugin(fixture.root, 'wago', { ...fixture.VALID_MANIFEST, name: 'wago' });
      fixture.writePlugin(fixture.root, 'npm-QGF0dHJhY2Nlc3MvcGx1Z2luLXdhZ28', {
        ...fixture.VALID_MANIFEST,
        name: 'wago',
      });
      writeFileSync(join(fixture.root, '.npm-plugin-state.json'), '[]');

      expect(PluginService.getPlugins().map(({ pluginDirectory }) => pluginDirectory)).toEqual(['wago']);
    });

    it('discovers a tracked npm installation', () => {
      const folder = 'npm-QGF0dHJhY2Nlc3MvcGx1Z2luLXdhZ28';
      fixture.writePlugin(fixture.root, folder, { ...fixture.VALID_MANIFEST, name: 'wago' });
      writeFileSync(join(fixture.root, '.npm-plugin-state.json'), JSON.stringify([{ installPath: folder }]));

      expect(PluginService.getPlugins().map(({ pluginDirectory }) => pluginDirectory)).toEqual([folder]);
    });

    it('keeps npm directories visible when the install state file is unreadable', () => {
      const folder = 'npm-QGF0dHJhY2Nlc3MvcGx1Z2luLXdhZ28';
      fixture.writePlugin(fixture.root, folder, { ...fixture.VALID_MANIFEST, name: 'wago' });
      writeFileSync(join(fixture.root, '.npm-plugin-state.json'), '{corrupt');

      expect(PluginService.getPlugins().map(({ pluginDirectory }) => pluginDirectory)).toEqual([folder]);
    });

    it('rejects a ZIP upload whose name falls in the reserved npm directory namespace', async () => {
      const zip = zipFileUpload({ 'plugin.json': JSON.stringify({ ...fixture.VALID_MANIFEST, name: 'npm-tools' }) });

      await expect(new PluginService().uploadPlugin(zip)).rejects.toThrow('visible single path segment');
    });

    it('returns an empty array when the plugin folder does not exist', () => {
      PluginService.configure({ PLUGIN_DIR: join(fixture.root, 'does-not-exist'), RESTART_BY_EXIT: true });
      expect(PluginService.getPlugins()).toEqual([]);
    });

    it('discovers a manifest and assigns a stable id and prefixed backend directory', () => {
      fixture.writePlugin(fixture.root, 'my-plugin', {
        name: 'my-plugin',
        version: '1.0.0',
        main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
        attraccessVersion: { min: '1.0.0' },
      });

      const plugins = PluginService.getPlugins();
      expect(plugins).toHaveLength(1);
      expect(plugins[0].name).toBe('my-plugin');
      expect(plugins[0].pluginDirectory).toBe('my-plugin');
      expect(plugins[0].id).toEqual(expect.any(String));
      expect(plugins[0].main.backend.directory).toBe(join('my-plugin', 'dist'));
    });

    it('keeps a plugin id stable across discovery scans', () => {
      fixture.writePlugin(fixture.root, 'stable-plugin', {
        name: 'stable-plugin',
        version: '1.0.0',
        main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
        attraccessVersion: { min: '1.0.0' },
      });

      const first = PluginService.getPlugins()[0].id;
      PluginService.configure({ PLUGIN_DIR: fixture.root, RESTART_BY_EXIT: true });

      expect(PluginService.getPlugins()[0].id).toBe(first);
    });

    it('reports per-plugin backend load status (loaded / error / unknown)', () => {
      fixture.writePlugin(fixture.root, 'plugin-ok', {
        name: 'plugin-ok',
        version: '1.0.0',
        main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
        attraccessVersion: { min: '1.0.0' },
      });
      fixture.writePlugin(fixture.root, 'plugin-bad', {
        name: 'plugin-bad',
        version: '2.0.0',
        main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
        attraccessVersion: { min: '1.0.0' },
      });

      PluginService.getPlugins();
      PluginService.markPluginAsLoaded('plugin-ok@1.0.0');
      PluginService.setPluginLoadError('plugin-bad@2.0.0', new Error("Cannot find module '@nestjs/common'"));

      const byName = Object.fromEntries(PluginService.getPluginsWithLoadStatus().map((p) => [p.name, p]));
      expect(byName['plugin-ok'].status).toBe('loaded');
      expect(byName['plugin-ok'].error).toBeNull();
      expect(byName['plugin-bad'].status).toBe('error');
      expect(byName['plugin-bad'].error).toBe("Cannot find module '@nestjs/common'");
    });

    it('persists a quarantined plugin error across a new process discovery', () => {
      fixture.writePlugin(fixture.root, 'crashing-plugin', {
        name: 'crashing-plugin',
        version: '1.0.0',
        main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
        attraccessVersion: { min: '1.0.0' },
      });
      const [plugin] = PluginService.getPlugins();

      PluginService.quarantinePlugin(plugin, new Error('onModuleInit failed'));
      PluginService.configure({ PLUGIN_DIR: fixture.root, RESTART_BY_EXIT: true });

      expect(PluginService.isPluginQuarantined(PluginService.getPlugins()[0])).toBe(true);
      expect(PluginService.getPluginsWithLoadStatus()[0]).toMatchObject({
        status: 'error',
        error: 'onModuleInit failed',
      });
    });

    it('keeps a failed plugin quarantined in memory when persistence fails', () => {
      fixture.writePlugin(fixture.root, 'crashing-plugin', {
        name: 'crashing-plugin',
        version: '1.0.0',
        main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
        attraccessVersion: { min: '1.0.0' },
      });
      const [plugin] = PluginService.getPlugins();
      jest
        .spyOn(PluginService as unknown as { writeFailures(failures: unknown[]): void }, 'writeFailures')
        .mockImplementation(() => {
          throw new Error('read-only plugin directory');
        });

      expect(() => PluginService.quarantinePlugin(plugin, new Error('onModuleInit failed'))).not.toThrow();
      expect(PluginService.isPluginQuarantined(plugin)).toBe(true);
    });

    it('removes quarantine state when a plugin is replaced', () => {
      fixture.writePlugin(fixture.root, 'repaired-plugin', {
        name: 'repaired-plugin',
        version: '1.0.0',
        main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
        attraccessVersion: { min: '1.0.0' },
      });
      const [plugin] = PluginService.getPlugins();
      PluginService.quarantinePlugin(plugin, new Error('prior crash'));

      PluginService.clearPluginQuarantine(plugin.pluginDirectory);
      PluginService.configure({ PLUGIN_DIR: fixture.root, RESTART_BY_EXIT: true });

      expect(PluginService.isPluginQuarantined(PluginService.getPlugins()[0])).toBe(false);
    });

    it('preserves quarantine state when clearing it cannot be persisted', () => {
      fixture.writePlugin(fixture.root, 'repaired-plugin', {
        name: 'repaired-plugin',
        version: '1.0.0',
        main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
        attraccessVersion: { min: '1.0.0' },
      });
      const [plugin] = PluginService.getPlugins();
      PluginService.quarantinePlugin(plugin, new Error('prior crash'));
      jest
        .spyOn(PluginService as unknown as { writeFailures(failures: unknown[]): void }, 'writeFailures')
        .mockImplementation(() => {
          throw new Error('read-only plugin directory');
        });

      expect(() => PluginService.clearPluginQuarantine(plugin.pluginDirectory)).toThrow('read-only plugin directory');
      expect(PluginService.isPluginQuarantined(plugin)).toBe(true);
    });

    it('persists the startup error before quarantining plugins from an incomplete startup', () => {
      fixture.writePlugin(fixture.root, 'previously-active', {
        name: 'previously-active',
        version: '1.0.0',
        main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
        attraccessVersion: { min: '1.0.0' },
      });

      PluginService.beginBootGuard();
      const error = new Error('Plugin onModuleInit failed');
      error.stack = `${error.stack}\n    at ${join(fixture.root, 'previously-active', 'dist', 'index.js')}:1:1`;
      PluginService.recordBootFailure(error);
      PluginService.configure({ PLUGIN_DIR: fixture.root, RESTART_BY_EXIT: true });
      PluginService.beginBootGuard();

      const [plugin] = PluginService.getPlugins();
      expect(PluginService.isPluginQuarantined(plugin)).toBe(true);
      expect(PluginService.getPluginsWithLoadStatus()[0].error).toBe('Plugin onModuleInit failed');
    });

    it('quarantines guarded plugins after an abrupt startup failure', () => {
      fixture.writePlugin(fixture.root, 'unrelated-plugin', {
        name: 'unrelated-plugin',
        version: '1.0.0',
        main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
        attraccessVersion: { min: '1.0.0' },
      });

      PluginService.beginBootGuard();
      PluginService.configure({ PLUGIN_DIR: fixture.root, RESTART_BY_EXIT: true });
      PluginService.beginBootGuard();

      const [plugin] = PluginService.getPlugins();
      expect(PluginService.isPluginQuarantined(plugin)).toBe(true);
    });

    it.each(['SIGINT', 'SIGTERM'] as const)('does not quarantine plugins when startup is stopped by %s', (signal) => {
      fixture.writePlugin(fixture.root, 'installed-plugin', {
        name: 'installed-plugin',
        version: '1.0.0',
        main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
        attraccessVersion: { min: '1.0.0' },
      });
      jest.spyOn(process, 'kill').mockImplementation(() => true);
      const existing = new Set(process.listeners(signal));
      PluginService.beginBootGuard();
      const handler = process.listeners(signal).find((listener) => !existing.has(listener));
      expect(handler).toBeDefined();
      handler?.();
      PluginService.configure({ PLUGIN_DIR: fixture.root, RESTART_BY_EXIT: true });
      PluginService.beginBootGuard();

      expect(PluginService.isPluginQuarantined(PluginService.getPlugins()[0])).toBe(false);
    });

    it('creates a configured plugin directory before writing boot guard state', () => {
      const missingRoot = join(fixture.root, 'does-not-exist');
      PluginService.configure({ PLUGIN_DIR: missingRoot, RESTART_BY_EXIT: true });

      expect(() => PluginService.beginBootGuard()).not.toThrow();
      expect(existsSync(join(missingRoot, '.plugin-boot-guard.json'))).toBe(true);
    });

    it('caches discovery between calls and re-scans after configure', () => {
      fixture.writePlugin(fixture.root, 'plugin-a', {
        name: 'plugin-a',
        version: '1.0.0',
        main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
        attraccessVersion: { min: '1.0.0' },
      });

      const first = PluginService.getPlugins();
      expect(PluginService.getPlugins()).toBe(first);

      PluginService.configure({ PLUGIN_DIR: fixture.root, RESTART_BY_EXIT: true });
      expect(PluginService.getPlugins()).not.toBe(first);
    });

    it('skips folders without a manifest', () => {
      mkdirSync(join(fixture.root, 'not-a-plugin'), { recursive: true });
      expect(PluginService.getPlugins()).toEqual([]);
    });

    it('excludes internal npm backup storage from discovery', () => {
      fixture.writePlugin(fixture.root, '.npm-backups', {
        name: 'stale-plugin',
        version: '1.0.0',
        main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
        attraccessVersion: { min: '1.0.0' },
      });

      expect(PluginService.getPlugins()).toEqual([]);
    });

    it('excludes hidden replacement backups from discovery', () => {
      fixture.writePlugin(fixture.root, '.uploaded-plugin-backup', {
        name: 'uploaded-plugin',
        version: '1.0.0',
        main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
        attraccessVersion: { min: '1.0.0' },
      });

      expect(PluginService.getPlugins()).toEqual([]);
    });

    it('excludes a plugin whose declared permissions are invalid', () => {
      fixture.writePlugin(fixture.root, 'bad-perms', {
        name: 'bad-perms',
        version: '1.0.0',
        main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
        attraccessVersion: { min: '1.0.0' },
        permissions: ['NOT_A_REAL_PERMISSION'],
      });

      expect(PluginService.getPlugins()).toEqual([]);
    });
  });

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
});
