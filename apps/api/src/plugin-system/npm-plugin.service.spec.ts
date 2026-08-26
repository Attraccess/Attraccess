import { createHash } from 'crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { lookup } from 'dns/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import * as tar from 'tar';
import axios from 'axios';
import { PluginService } from './plugin.service';
import { NpmPluginService } from './npm-plugin.service';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));

type ServiceInternals = {
  download(url: string): Promise<Buffer>;
  hostVersion(): string;
};

type SettingsMock = {
  getPlainSetting: jest.Mock;
  getSecretSetting: jest.Mock;
  setPlainSetting: jest.Mock;
  setSecretSetting: jest.Mock;
};

async function packageTarball(name: string): Promise<Buffer> {
  const root = mkdtempSync(join(tmpdir(), 'npm-plugin-package-'));
  try {
    mkdirSync(join(root, 'package', 'dist'), { recursive: true });
    writeFileSync(
      join(root, 'package', 'package.json'),
      JSON.stringify({
        name,
        version: '1.2.3',
        keywords: ['attraccess-plugin'],
        peerDependencies: { '@attraccess/plugins-backend-sdk': '*' },
        attraccess: {
          displayName: name,
          host: '*',
          backend: 'dist/index.js',
          sdk: { backend: '*' },
        },
      }),
    );
    writeFileSync(join(root, 'package', 'dist', 'index.js'), 'module.exports = {};');

    const archive = tar.c({ cwd: root, gzip: true }, ['package']);
    const chunks: Buffer[] = [];
    for await (const chunk of archive) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('NpmPluginService', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'npm-plugin-service-'));
    PluginService.configure({ PLUGIN_DIR: root, RESTART_BY_EXIT: true });
    jest.spyOn(PluginService.prototype, 'requestRestart').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  it('pins metadata requests to public registry addresses and limits their size', async () => {
    const settings: SettingsMock = {
      getPlainSetting: jest.fn(),
      getSecretSetting: jest.fn(),
      setPlainSetting: jest.fn(),
      setSecretSetting: jest.fn(),
    };
    const service = new NpmPluginService(settings as unknown as never);
    const axiosGet = jest.spyOn(axios, 'get').mockResolvedValue({ data: { versions: {} } });
    jest.mocked(lookup).mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);

    await service.packageMetadata('example');

    expect(axiosGet).toHaveBeenCalledWith(
      'https://registry.npmjs.org/example',
      expect.objectContaining({ maxContentLength: 10 * 1024 * 1024, maxRedirects: 0 }),
    );
    const options = axiosGet.mock.calls[0]?.[1];
    if (!options?.lookup) throw new Error('Expected metadata request to pin DNS lookup');
    const callback = jest.fn();
    options.lookup('registry.npmjs.org', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '1.1.1.1', 4);
  });

  it('rejects metadata requests to private registry addresses', async () => {
    const settings: SettingsMock = {
      getPlainSetting: jest.fn().mockResolvedValue(JSON.stringify([{ id: 'private', name: 'private', url: 'http://private.test' }])),
      getSecretSetting: jest.fn().mockResolvedValue({ value: null, configured: false }),
      setPlainSetting: jest.fn(),
      setSecretSetting: jest.fn(),
    };
    const service = new NpmPluginService(settings as unknown as never);
    const axiosGet = jest.spyOn(axios, 'get');
    jest.mocked(lookup).mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

    await expect(service.packageMetadata('example', 'private')).rejects.toThrow('public addresses');
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('does not persist a registry when token storage fails', async () => {
    const settings: SettingsMock = {
      getPlainSetting: jest.fn().mockResolvedValue(null),
      getSecretSetting: jest.fn(),
      setPlainSetting: jest.fn(),
      setSecretSetting: jest.fn().mockRejectedValue(new Error('encryption failed')),
    };
    const service = new NpmPluginService(settings as unknown as never);

    await expect(service.addRegistry({ name: 'private', url: 'https://registry.example.com', token: 'secret' })).rejects.toThrow(
      'encryption failed',
    );
    expect(settings.setPlainSetting).not.toHaveBeenCalled();
  });

  it('installs standard package-prefixed tarballs without losing concurrent state updates', async () => {
    const service = new NpmPluginService({} as never);
    const internals = service as unknown as ServiceInternals;
    const packages = await Promise.all(
      ['@attraccess/one', '@attraccess/two'].map(async (name) => [name, await packageTarball(name)] as const),
    );
    const tarballs = new Map(packages);

    jest.spyOn(internals, 'hostVersion').mockReturnValue('1.9.0');
    jest.spyOn(service, 'packageMetadata').mockImplementation(async (name) => {
      const tarball = tarballs.get(name);
      if (!tarball) throw new Error(`Unexpected package ${name}`);
      return {
        versions: {
          '1.2.3': {
            version: '1.2.3',
            dist: { tarball: name, shasum: createHash('sha1').update(tarball).digest('hex') },
          },
        },
      };
    });
    jest.spyOn(internals, 'download').mockImplementation(async (name) => {
      const tarball = tarballs.get(name);
      if (!tarball) throw new Error(`Unexpected tarball ${name}`);
      return tarball;
    });

    await Promise.all(['@attraccess/one', '@attraccess/two'].map((name) => service.install(name, '1.2.3')));

    expect(service.listInstalled()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: '@attraccess/one' }),
        expect.objectContaining({ name: '@attraccess/two' }),
      ]),
    );
    expect(existsSync(join(root, 'npm-QGF0dHJhY2Nlc3Mvb25l', 'dist', 'index.js'))).toBe(true);
  });
});
