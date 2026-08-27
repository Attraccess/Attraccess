import { NotFoundException, StreamableFile } from '@nestjs/common';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PluginController } from './plugin.controller';
import { PluginService } from './plugin.service';
import { LoadedPluginManifest } from './plugin.manifest';
import { FileUpload } from '../common/types/file-upload.types';

function frontendPlugin(name: string): LoadedPluginManifest {
  return {
    id: name,
    name,
    version: '1.0.0',
    pluginDirectory: name,
    permissions: [],
    main: { frontend: { directory: join(name, 'frontend'), entryPoint: 'index.mjs' } },
    attraccessVersion: { min: '1.0.0' },
  } as LoadedPluginManifest;
}

describe('PluginController', () => {
  let root: string;
  let service: { uploadPlugin: jest.Mock; deletePlugin: jest.Mock };
  let npmService: { searchMarketplace: jest.Mock; marketplacePackage: jest.Mock };
  let controller: PluginController;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'plugin-controller-'));
    PluginService.configure({ PLUGIN_DIR: root, RESTART_BY_EXIT: true });
    service = { uploadPlugin: jest.fn(), deletePlugin: jest.fn() };
    npmService = { searchMarketplace: jest.fn(), marketplacePackage: jest.fn() };
    controller = new PluginController(service as unknown as PluginService, npmService as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  it('returns every discovered plugin enriched with load status', () => {
    const plugins = [frontendPlugin('a'), frontendPlugin('b')];
    jest.spyOn(PluginService, 'getPlugins').mockReturnValue(plugins);
    expect(controller.getAllPlugins()).toEqual(
      plugins.map((plugin) => ({ ...plugin, status: 'unknown', error: null })),
    );
  });

  describe('getFrontendPluginFile', () => {
    it('streams an existing frontend file', () => {
      const plugin = frontendPlugin('streamed');
      jest.spyOn(PluginService, 'getPlugins').mockReturnValue([plugin]);
      mkdirSync(join(root, 'streamed', 'frontend'), { recursive: true });
      writeFileSync(join(root, 'streamed', 'frontend', 'index.js'), 'console.log(1)');

      const streamable = controller.getFrontendPluginFile('streamed', 'index.js');
      expect(streamable).toBeInstanceOf(StreamableFile);
      // the stream opens lazily, so afterEach's rmSync races it into an ENOENT 'error' event.
      // Unhandled, that kills the whole jest worker — swallow it and close the fd.
      streamable
        .getStream()
        .on('error', () => undefined)
        .destroy();
    });

    it.each([
      ['index.js', 'application/javascript'],
      ['style.css', 'text/css'],
    ])('serves %s with content type %s', (fileName, contentType) => {
      const plugin = frontendPlugin('typed');
      jest.spyOn(PluginService, 'getPlugins').mockReturnValue([plugin]);
      mkdirSync(join(root, 'typed', 'frontend'), { recursive: true });
      writeFileSync(join(root, 'typed', 'frontend', fileName), '/* content */');

      const file = controller.getFrontendPluginFile('typed', fileName);
      expect(file.options.type).toBe(contentType);
      file
        .getStream()
        .on('error', () => undefined)
        .destroy();
    });

    it('throws when the plugin is unknown', () => {
      jest.spyOn(PluginService, 'getPlugins').mockReturnValue([]);
      expect(() => controller.getFrontendPluginFile('ghost', 'index.js')).toThrow(NotFoundException);
    });

    it('throws when the plugin has no frontend entry', () => {
      const plugin = {
        ...frontendPlugin('backend-only'),
        main: { backend: { directory: 'backend', entryPoint: 'index.js' } },
      };
      jest.spyOn(PluginService, 'getPlugins').mockReturnValue([plugin as LoadedPluginManifest]);
      expect(() => controller.getFrontendPluginFile('backend-only', 'index.js')).toThrow(NotFoundException);
    });

    it('throws when the requested file is missing', () => {
      jest.spyOn(PluginService, 'getPlugins').mockReturnValue([frontendPlugin('present')]);
      expect(() => controller.getFrontendPluginFile('present', 'missing.js')).toThrow(NotFoundException);
    });
  });

  it('delegates upload to the plugin service', async () => {
    const file = { originalname: 'plugin.zip' } as FileUpload;
    service.uploadPlugin.mockResolvedValue({ name: 'uploaded' });
    await expect(controller.uploadPlugin(file, {})).resolves.toEqual({ name: 'uploaded' });
    expect(service.uploadPlugin).toHaveBeenCalledWith(file);
  });

  it('delegates delete to the plugin service', () => {
    controller.deletePlugin('plugin-id');
    expect(service.deletePlugin).toHaveBeenCalledWith('plugin-id');
  });

  it('delegates marketplace search with an optional registry', () => {
    controller.searchMarketplace('shelly', 'private');
    expect(npmService.searchMarketplace).toHaveBeenCalledWith('shelly', 'private');
  });

  it('delegates direct marketplace lookup with its selected registry', () => {
    controller.marketplacePackage('@private/plugin', 'private');
    expect(npmService.marketplacePackage).toHaveBeenCalledWith('@private/plugin', 'private');
  });
});
