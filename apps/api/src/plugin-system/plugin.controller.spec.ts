import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { BadRequestException, Logger, NotFoundException, StreamableFile } from '@nestjs/common';
import { Response } from 'express';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PassThrough } from 'stream';
import { PluginController } from './plugin.controller';
import { PluginAdministrationService } from './plugin-administration.service';
import { PluginService } from './plugin.service';
import { PluginUninstallService } from './plugin-uninstall.service';
import { PluginModule } from './plugin.module';
import { LoadedPluginManifest } from './plugin.manifest';
import { FileUpload } from '../common/types/file-upload.types';
import { auditSubjectKeyId } from '../audit/policies/administration';

function frontendPlugin(name: string): LoadedPluginManifest {
  return {
    id: name,
    name,
    version: '1.0.0',
    pluginDirectory: name,
    permissions: [],
    main: { frontend: { directory: join(name, 'frontend'), entryPoint: 'index.mjs' } },
    attraccessVersion: { min: '2.0.0-0' },
  } as LoadedPluginManifest;
}

const req = { user: { id: 42, authenticationMethod: 'session' } } as AuthenticatedRequest;

describe('PluginController', () => {
  let root: string;
  let service: {
    uploadPlugin: jest.Mock;
    deletePlugin: jest.Mock;
    requestRestart: jest.Mock;
    clearHealthEntries: jest.Mock;
  };
  let npmService: {
    findInstalledByPluginId: jest.Mock;
    listInstalled: jest.Mock;
    removeInstalled: jest.Mock;
    searchMarketplace: jest.Mock;
    marketplacePackage: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let controller: PluginController;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'plugin-controller-'));
    PluginService.configure({ PLUGIN_DIR: root, RESTART_BY_EXIT: true });
    PluginModule.configure({ DISABLE_PLUGINS: false });
    service = {
      uploadPlugin: jest.fn(),
      deletePlugin: jest.fn(),
      requestRestart: jest.fn(),
      clearHealthEntries: jest.fn(),
    };
    npmService = {
      findInstalledByPluginId: jest.fn(),
      listInstalled: jest.fn().mockReturnValue([]),
      removeInstalled: jest.fn(),
      searchMarketplace: jest.fn(),
      marketplacePackage: jest.fn(),
    };
    audit = { record: jest.fn() };
    controller = new PluginController(
      npmService as never,
      new PluginAdministrationService(
        service as unknown as PluginService,
        service as unknown as PluginUninstallService,
        npmService as never,
        audit as never,
      ),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  it('returns every discovered plugin enriched with load status', () => {
    const plugins = [frontendPlugin('a'), frontendPlugin('b')];
    jest.spyOn(PluginService, 'getDiscoveredPlugins').mockReturnValue(plugins);
    expect(controller.getAllPlugins()).toEqual(
      plugins.map((plugin) => ({ ...plugin, refused: false, status: 'unknown', error: null })),
    );
  });

  it('reports when plugins are globally disabled', () => {
    PluginModule.configure({ DISABLE_PLUGINS: true });

    expect(controller.getPluginSystemStatus()).toEqual({ disabled: true, instanceId: expect.any(String) });
  });

  describe('retryPlugin', () => {
    it('clears a failed plugin quarantine and schedules a restart', async () => {
      const plugin = frontendPlugin('failed');
      jest.spyOn(PluginService, 'getManifestById').mockReturnValue(plugin);
      jest.spyOn(PluginService, 'isPluginQuarantined').mockReturnValue(true);
      const clearQuarantine = jest.spyOn(PluginService, 'clearPluginQuarantine');

      await expect(controller.retryPlugin(plugin.id, req)).resolves.toEqual({ ok: true });
      expect(clearQuarantine).toHaveBeenCalledWith(plugin.pluginDirectory);
      expect(service.requestRestart).toHaveBeenCalledTimes(1);
    });

    it('uses the manifest name, not the directory ID, for the ZIP audit subject', async () => {
      const plugin = { ...frontendPlugin('stable-name'), id: 'directory-id' };
      jest.spyOn(PluginService, 'getManifestById').mockReturnValue(plugin);
      jest.spyOn(PluginService, 'isPluginQuarantined').mockReturnValue(true);

      await controller.retryPlugin(plugin.id, req);

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: 'administration',
          subject: expect.objectContaining({ id: auditSubjectKeyId(plugin.name) }),
          details: expect.objectContaining({ pluginId: plugin.id }),
        }),
      );
    });

    it('rejects an unknown plugin without scheduling a restart', async () => {
      jest.spyOn(PluginService, 'getManifestById').mockReturnValue(undefined);

      await expect(controller.retryPlugin('missing', req)).rejects.toThrow(NotFoundException);
      expect(service.requestRestart).not.toHaveBeenCalled();
    });

    it('rejects a plugin that is not quarantined', async () => {
      const plugin = frontendPlugin('loaded');
      jest.spyOn(PluginService, 'getManifestById').mockReturnValue(plugin);
      jest.spyOn(PluginService, 'isPluginQuarantined').mockReturnValue(false);

      await expect(controller.retryPlugin(plugin.id, req)).rejects.toThrow(BadRequestException);
      expect(service.requestRestart).not.toHaveBeenCalled();
    });
  });

  describe('getFrontendPluginFile', () => {
    let res: Response;

    beforeEach(() => {
      res = new PassThrough() as unknown as Response;
    });

    it('streams an existing frontend file', () => {
      const plugin = frontendPlugin('streamed');
      jest.spyOn(PluginService, 'getPlugins').mockReturnValue([plugin]);
      mkdirSync(join(root, 'streamed', 'frontend'), { recursive: true });
      writeFileSync(join(root, 'streamed', 'frontend', 'index.js'), 'console.log(1)');

      const streamable = controller.getFrontendPluginFile('streamed', 'index.js', res);
      expect(streamable).toBeInstanceOf(StreamableFile);
      // the stream opens lazily, so afterEach's rmSync races it into an ENOENT 'error' event.
      // Unhandled, that kills the whole jest worker — swallow it and close the fd.
      streamable
        .getStream()
        .on('error', () => undefined)
        .destroy();
    });

    it.each([
      ['during the download', false],
      ['before the handler runs', true],
    ])('closes the file when the client disconnects %s', async (_label, closedEarly) => {
      jest.spyOn(PluginService, 'getPlugins').mockReturnValue([frontendPlugin('aborted')]);
      mkdirSync(join(root, 'aborted', 'frontend'), { recursive: true });
      writeFileSync(join(root, 'aborted', 'frontend', 'index.js'), 'console.log(1)');
      const settle = () => new Promise((resolvePromise) => setImmediate(resolvePromise));
      if (closedEarly) {
        res.destroy();
        await settle();
      }

      const stream = controller.getFrontendPluginFile('aborted', 'index.js', res).getStream();
      stream.on('error', () => undefined);
      if (!closedEarly) res.destroy();
      await settle();

      expect(stream.destroyed).toBe(true);
    });

    it.each([
      ['index.js', 'application/javascript'],
      ['style.css', 'text/css'],
    ])('serves %s with content type %s', (fileName, contentType) => {
      const plugin = frontendPlugin('typed');
      jest.spyOn(PluginService, 'getPlugins').mockReturnValue([plugin]);
      mkdirSync(join(root, 'typed', 'frontend'), { recursive: true });
      writeFileSync(join(root, 'typed', 'frontend', fileName), '/* content */');

      const file = controller.getFrontendPluginFile('typed', fileName, res);
      expect(file.options.type).toBe(contentType);
      file
        .getStream()
        .on('error', () => undefined)
        .destroy();
    });

    it('throws when the plugin is unknown', () => {
      jest.spyOn(PluginService, 'getPlugins').mockReturnValue([]);
      expect(() => controller.getFrontendPluginFile('ghost', 'index.js', res)).toThrow(NotFoundException);
    });

    it('throws when the plugin has no frontend entry', () => {
      const plugin = {
        ...frontendPlugin('backend-only'),
        main: { backend: { directory: 'backend', entryPoint: 'index.js' } },
      };
      jest.spyOn(PluginService, 'getPlugins').mockReturnValue([plugin as LoadedPluginManifest]);
      expect(() => controller.getFrontendPluginFile('backend-only', 'index.js', res)).toThrow(NotFoundException);
    });

    it('throws when the requested file is missing', () => {
      jest.spyOn(PluginService, 'getPlugins').mockReturnValue([frontendPlugin('present')]);
      expect(() => controller.getFrontendPluginFile('present', 'missing.js', res)).toThrow(NotFoundException);
    });

    describe('containment', () => {
      let outside: string;

      function readServed(file: StreamableFile): Promise<string> {
        return new Promise((resolvePromise, reject) => {
          let body = '';
          file
            .getStream()
            .on('data', (chunk) => (body += chunk))
            .on('end', () => resolvePromise(body))
            .on('error', reject);
        });
      }

      beforeEach(() => {
        jest.spyOn(PluginService, 'getPlugins').mockReturnValue([frontendPlugin('guarded')]);
        mkdirSync(join(root, 'guarded', 'frontend', 'assets', 'sub'), { recursive: true });
        writeFileSync(join(root, 'guarded', 'frontend', 'assets', 'sub', 'chunk.js'), 'nested');
        writeFileSync(join(root, 'guarded', 'frontend', 'chunk,with,commas.js'), 'commas');
        writeFileSync(join(root, 'guarded', 'plugin.json'), '{"secret":true}');
        outside = mkdtempSync(join(tmpdir(), 'plugin-controller-outside-'));
        writeFileSync(join(outside, 'secret.txt'), 'secret');
      });

      afterEach(() => {
        rmSync(outside, { recursive: true, force: true });
      });

      it('serves a nested file given as path-to-regexp segments', async () => {
        await expect(
          readServed(controller.getFrontendPluginFile('guarded', ['assets', 'sub', 'chunk.js'], res)),
        ).resolves.toBe('nested');
      });

      it('serves a nested file given as a slash-separated string', async () => {
        await expect(readServed(controller.getFrontendPluginFile('guarded', 'assets/sub/chunk.js', res))).resolves.toBe(
          'nested',
        );
      });

      it('serves a file whose name contains commas', async () => {
        await expect(
          readServed(controller.getFrontendPluginFile('guarded', ['chunk,with,commas.js'], res)),
        ).resolves.toBe('commas');
      });

      it.each([
        ['no segments', []],
        ['an empty segment', ['assets', '', 'sub', 'chunk.js']],
        ['a dot segment', ['.']],
        ['a parent segment', ['..', 'plugin.json']],
        ['a decoded slash', ['../plugin.json']],
        ['a decoded backslash', ['..\\plugin.json']],
        ['a NUL byte', ['assets', 'sub', 'chunk.js\0.css']],
        ['an absolute path', ['/etc/passwd']],
        ['a drive letter', ['C:', 'Windows', 'win.ini']],
        ['a directory', ['assets']],
      ])('refuses %s with a generic 404', (_label, segments) => {
        expect(() => controller.getFrontendPluginFile('guarded', segments, res)).toThrow(
          new NotFoundException('Frontend file not found for plugin guarded'),
        );
      });

      it('refuses a symlink that points outside the frontend directory', () => {
        symlinkSync(join(outside, 'secret.txt'), join(root, 'guarded', 'frontend', 'escape.js'));

        expect(() => controller.getFrontendPluginFile('guarded', ['escape.js'], res)).toThrow(NotFoundException);
      });

      it('serves a symlink that stays inside the frontend directory', async () => {
        symlinkSync(
          join(root, 'guarded', 'frontend', 'assets', 'sub', 'chunk.js'),
          join(root, 'guarded', 'frontend', 'alias.js'),
        );

        await expect(readServed(controller.getFrontendPluginFile('guarded', ['alias.js'], res))).resolves.toBe(
          'nested',
        );
      });

      it('refuses a manifest whose frontend directory points outside the plugin path', () => {
        const plugin = frontendPlugin('malicious');
        plugin.main.frontend = { directory: join('malicious', '..', '..'), entryPoint: 'index.mjs' };
        jest.spyOn(PluginService, 'getPlugins').mockReturnValue([plugin]);
        mkdirSync(join(root, 'malicious'), { recursive: true });
        const escapedRoot = join(root, '..');

        expect(() =>
          controller.getFrontendPluginFile(
            'malicious',
            [root.slice(escapedRoot.length + 1), 'guarded', 'plugin.json'],
            res,
          ),
        ).toThrow(NotFoundException);
      });

      it('logs a refused request at warn with only a short sanitized prefix', () => {
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        const input = ['../../../../\u001b[31m' + 'a'.repeat(100)];

        expect(() => controller.getFrontendPluginFile('guarded', input, res)).toThrow(NotFoundException);

        expect(warn).toHaveBeenCalledTimes(1);
        const message = warn.mock.calls[0][0] as string;
        expect(message).toContain('guarded');
        expect(message).toContain('separator in segment');
        expect(message).not.toContain(root);
        expect(message).not.toContain('\u001b');
        expect(message).not.toContain('a'.repeat(40));
      });

      it('logs an ordinary missing file below warn', () => {
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        const debug = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);

        expect(() => controller.getFrontendPluginFile('guarded', ['stale-chunk.js'], res)).toThrow(NotFoundException);

        expect(warn).not.toHaveBeenCalled();
        expect(debug).toHaveBeenCalledWith(expect.stringContaining('file missing'));
      });

      it('refuses a manifest whose frontend directory points into another plugin', () => {
        const plugin = frontendPlugin('neighbour');
        plugin.main.frontend = { directory: 'guarded', entryPoint: 'index.mjs' };
        jest.spyOn(PluginService, 'getPlugins').mockReturnValue([plugin]);
        mkdirSync(join(root, 'neighbour'), { recursive: true });

        expect(() => controller.getFrontendPluginFile('neighbour', ['plugin.json'], res)).toThrow(NotFoundException);
      });
    });
  });

  it('delegates upload to the plugin service', async () => {
    const file = { originalname: 'plugin.zip' } as FileUpload;
    service.uploadPlugin.mockResolvedValue({ name: 'uploaded' });
    await expect(controller.uploadPlugin(file, {}, req)).resolves.toEqual({ name: 'uploaded' });
    expect(service.uploadPlugin).toHaveBeenCalledWith(file, true);
    expect(service.requestRestart).toHaveBeenCalledTimes(1);
  });

  it('delegates non-npm plugin deletion to the plugin service', async () => {
    await controller.deletePlugin('plugin-id', req);
    expect(service.deletePlugin).toHaveBeenCalledWith('plugin-id', true);
    expect(service.requestRestart).toHaveBeenCalledTimes(1);
  });

  it('delegates marketplace search with an optional registry', () => {
    controller.searchMarketplace('demo', 'private');
    expect(npmService.searchMarketplace).toHaveBeenCalledWith('demo', 'private');
  });

  it('delegates direct marketplace lookup with its selected registry', () => {
    controller.marketplacePackage('@private/plugin', 'private');
    expect(npmService.marketplacePackage).toHaveBeenCalledWith('@private/plugin', 'private');
  });

  it('uses the data-preserving npm removal flow for an installed npm package', async () => {
    const plugin = frontendPlugin('@attraccess/plugin');
    jest.spyOn(PluginService, 'getDiscoveredPlugins').mockReturnValue([plugin]);
    npmService.listInstalled.mockReturnValue([{ name: '@attraccess/plugin', installPath: plugin.pluginDirectory }]);

    await controller.deletePlugin(plugin.id, req);

    expect(npmService.removeInstalled).toHaveBeenCalledWith('@attraccess/plugin', true);
    // Its health entries go like an uploaded plugin's, by the manifest's plugin name.
    expect(service.clearHealthEntries).toHaveBeenCalledWith(plugin.name);
    expect(service.requestRestart).toHaveBeenCalledTimes(1);
    expect(service.deletePlugin).not.toHaveBeenCalled();
  });

  it('clears the health entries of an npm package removed by its package name', async () => {
    const plugin = frontendPlugin('npm-runtime-name');
    jest.spyOn(PluginService, 'getDiscoveredPlugins').mockReturnValue([plugin]);
    npmService.listInstalled.mockReturnValue([{ name: '@attraccess/plugin', installPath: plugin.pluginDirectory }]);

    await controller.removeInstalledPackage('@attraccess/plugin', req);

    expect(npmService.removeInstalled).toHaveBeenCalledWith('@attraccess/plugin', true);
    expect(service.clearHealthEntries).toHaveBeenCalledWith('npm-runtime-name');
  });

  it('uses the data-preserving npm removal flow when npm manifest discovery fails', async () => {
    npmService.findInstalledByPluginId.mockReturnValue({ name: '@attraccess/plugin' });

    await controller.deletePlugin('npm-plugin-id', req);

    expect(npmService.removeInstalled).toHaveBeenCalledWith('@attraccess/plugin', true);
    expect(service.requestRestart).toHaveBeenCalledTimes(1);
    expect(service.deletePlugin).not.toHaveBeenCalled();
  });

  it('deletes an uploaded plugin when it shares a manifest name with an npm package', async () => {
    const plugin = { ...frontendPlugin('@attraccess/plugin'), pluginDirectory: 'uploaded-plugin' };
    jest.spyOn(PluginService, 'getPlugins').mockReturnValue([plugin]);
    npmService.listInstalled.mockReturnValue([
      { name: '@attraccess/plugin', installPath: 'npm-QGF0dHJhY2Nlc3MvcGx1Z2lu' },
    ]);

    await controller.deletePlugin(plugin.id, req);

    expect(service.deletePlugin).toHaveBeenCalledWith(plugin.id, true);
    expect(service.requestRestart).toHaveBeenCalledTimes(1);
    expect(npmService.removeInstalled).not.toHaveBeenCalled();
  });
});
