import { createHash } from 'crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
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
  removeBackup(backup: string): Promise<void>;
};

type SettingsMock = {
  getPlainSetting: jest.Mock;
  getSecretSetting: jest.Mock;
  setPlainSetting: jest.Mock;
  setSecretSetting: jest.Mock;
};

async function packageTarball(name: string, permissions: string[] = []): Promise<Buffer> {
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
          permissions,
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
      getPlainSetting: jest
        .fn()
        .mockResolvedValue(JSON.stringify([{ id: 'private', name: 'private', url: 'http://private.test' }])),
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

    await expect(
      service.addRegistry({ name: 'private', url: 'https://registry.example.com', token: 'secret' }),
    ).rejects.toThrow('encryption failed');
    expect(settings.setPlainSetting).not.toHaveBeenCalled();
  });

  it('permits retrying registry token cleanup after its registry record was removed', async () => {
    const settings: SettingsMock = {
      getPlainSetting: jest.fn().mockResolvedValue(null),
      getSecretSetting: jest.fn(),
      setPlainSetting: jest.fn(),
      setSecretSetting: jest.fn(),
    };
    const service = new NpmPluginService(settings as unknown as never);

    await service.removeRegistry('orphaned');

    expect(settings.setSecretSetting).toHaveBeenCalledWith('plugin-registry', 'orphaned:token', null);
  });

  it('preserves a registry token when removing its record fails', async () => {
    const settings: SettingsMock = {
      getPlainSetting: jest
        .fn()
        .mockResolvedValue(JSON.stringify([{ id: 'private', name: 'private', url: 'https://registry.example.com' }])),
      getSecretSetting: jest.fn(),
      setPlainSetting: jest.fn().mockRejectedValue(new Error('database unavailable')),
      setSecretSetting: jest.fn(),
    };
    const service = new NpmPluginService(settings as unknown as never);

    await expect(service.removeRegistry('private')).rejects.toThrow('database unavailable');

    expect(settings.setSecretSetting).not.toHaveBeenCalled();
  });

  it('removes the registry record before deleting its token', async () => {
    const settings: SettingsMock = {
      getPlainSetting: jest
        .fn()
        .mockResolvedValue(JSON.stringify([{ id: 'private', name: 'private', url: 'https://registry.example.com' }])),
      getSecretSetting: jest.fn(),
      setPlainSetting: jest.fn(),
      setSecretSetting: jest.fn(),
    };
    const service = new NpmPluginService(settings as unknown as never);

    await service.removeRegistry('private');

    expect(settings.setPlainSetting.mock.invocationCallOrder[0]).toBeLessThan(
      settings.setSecretSetting.mock.invocationCallOrder[0],
    );
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

  it('does not activate concurrent installs of the same package', async () => {
    const name = '@attraccess/plugin';
    const tarball = await packageTarball(name);
    const service = new NpmPluginService({} as never);
    const internals = service as unknown as ServiceInternals;

    jest.spyOn(internals, 'hostVersion').mockReturnValue('1.9.0');
    jest.spyOn(service, 'packageMetadata').mockResolvedValue({
      versions: {
        '1.2.3': {
          version: '1.2.3',
          dist: { tarball: 'plugin', shasum: createHash('sha1').update(tarball).digest('hex') },
        },
      },
    });
    jest.spyOn(internals, 'download').mockResolvedValue(tarball);

    const results = await Promise.allSettled([service.install(name, '1.2.3'), service.install(name, '1.2.3')]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toEqual([
      expect.objectContaining({
        reason: expect.objectContaining({ message: 'Package is already installed; use the replacement endpoint' }),
      }),
    ]);
    expect(service.listInstalled()).toEqual([expect.objectContaining({ name, version: '1.2.3' })]);
  });

  it('resolves semver ranges while persisting the requested spec', async () => {
    const name = '@attraccess/plugin';
    const tarball = await packageTarball(name);
    const service = new NpmPluginService({} as never);
    const internals = service as unknown as ServiceInternals;
    jest.spyOn(internals, 'hostVersion').mockReturnValue('1.9.0');
    jest.spyOn(service, 'packageMetadata').mockResolvedValue({
      versions: {
        '1.0.0': {
          version: '1.0.0',
          dist: { tarball: 'older', shasum: createHash('sha1').update(tarball).digest('hex') },
        },
        '1.2.3': {
          version: '1.2.3',
          dist: { tarball: 'plugin', shasum: createHash('sha1').update(tarball).digest('hex') },
        },
      },
    });
    jest.spyOn(internals, 'download').mockResolvedValue(tarball);

    await expect(service.install(name, '^1.0.0')).resolves.toMatchObject({ version: '1.2.3', requestedSpec: '^1.0.0' });
  });

  it('removes npm package code and its installation record without reverting migrations', async () => {
    const name = '@attraccess/plugin';
    const installPath = `npm-${Buffer.from(name).toString('base64url')}`;
    mkdirSync(join(root, installPath), { recursive: true });
    writeFileSync(
      join(root, '.npm-plugin-state.json'),
      JSON.stringify([
        {
          name,
          version: '1.2.3',
          registryId: 'npm',
          registryUrl: 'https://registry.npmjs.org',
          integrity: 'sha512-test',
          installPath,
          permissions: [],
          lastError: null,
        },
      ]),
    );
    const service = new NpmPluginService({} as never);

    await service.removeInstalled(name);

    expect(existsSync(join(root, installPath))).toBe(false);
    expect(service.listInstalled()).toEqual([]);
    expect(PluginService.prototype.requestRestart).toHaveBeenCalled();
  });

  it('restarts after backup cleanup fails following a successful install', async () => {
    const name = '@attraccess/plugin';
    const tarball = await packageTarball(name);
    const target = join(root, `npm-${Buffer.from(name).toString('base64url')}`);
    mkdirSync(target, { recursive: true });
    writeFileSync(
      join(target, 'plugin.json'),
      JSON.stringify({
        name,
        version: '1.0.0',
        main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
        attraccessVersion: { min: '1.0.0' },
        permissions: [],
      }),
    );
    const service = new NpmPluginService({} as never);
    const internals = service as unknown as ServiceInternals;

    jest.spyOn(internals, 'hostVersion').mockReturnValue('1.9.0');
    jest.spyOn(service, 'packageMetadata').mockResolvedValue({
      versions: {
        '1.2.3': {
          version: '1.2.3',
          dist: { tarball: 'plugin', shasum: createHash('sha1').update(tarball).digest('hex') },
        },
      },
    });
    jest.spyOn(internals, 'download').mockResolvedValue(tarball);
    jest.spyOn(internals, 'removeBackup').mockRejectedValue(new Error('cleanup failed'));

    await expect(service.install(name, '1.2.3')).resolves.toMatchObject({ name, version: '1.2.3' });

    expect(PluginService.prototype.requestRestart).toHaveBeenCalled();
    expect(service.listInstalled()).toEqual([expect.objectContaining({ name, version: '1.2.3' })]);
    expect(readdirSync(join(root, '.npm-backups'))).toHaveLength(1);

    await service.onModuleInit();

    expect(existsSync(join(root, '.npm-backups'))).toBe(false);
  });

  it('restores the state-matching package after an interrupted replacement', async () => {
    const name = '@attraccess/plugin';
    const installPath = `npm-${Buffer.from(name).toString('base64url')}`;
    const backup = join(root, '.npm-backups', `${installPath}-00000000-0000-0000-0000-000000000000`);
    mkdirSync(join(backup, 'dist'), { recursive: true });
    writeFileSync(join(backup, 'plugin.json'), JSON.stringify({ name, version: '1.0.0' }));
    writeFileSync(join(backup, 'dist', 'index.js'), 'module.exports = {};');
    writeFileSync(
      join(root, '.npm-plugin-state.json'),
      JSON.stringify([
        {
          name,
          version: '1.0.0',
          registryId: 'npm',
          registryUrl: 'https://registry.npmjs.org',
          integrity: 'sha512-test',
          installPath,
          permissions: [],
          lastError: null,
        },
      ]),
    );
    const service = new NpmPluginService({} as never);

    await service.onModuleInit();

    expect(existsSync(join(root, installPath, 'dist', 'index.js'))).toBe(true);
    expect(existsSync(backup)).toBe(false);
  });

  it('replaces newly activated code with the state-matching backup after a crash', async () => {
    const name = '@attraccess/plugin';
    const installPath = `npm-${Buffer.from(name).toString('base64url')}`;
    const backup = join(root, '.npm-backups', `${installPath}-00000000-0000-0000-0000-000000000000`);
    mkdirSync(join(backup, 'dist'), { recursive: true });
    writeFileSync(join(backup, 'plugin.json'), JSON.stringify({ name, version: '1.0.0' }));
    writeFileSync(join(backup, 'dist', 'index.js'), 'module.exports = "1.0.0";');
    mkdirSync(join(root, installPath, 'dist'), { recursive: true });
    writeFileSync(join(root, installPath, 'plugin.json'), JSON.stringify({ name, version: '2.0.0' }));
    writeFileSync(join(root, installPath, 'dist', 'index.js'), 'module.exports = "2.0.0";');
    writeFileSync(
      join(root, '.npm-plugin-state.json'),
      JSON.stringify([
        {
          name,
          version: '1.0.0',
          registryId: 'npm',
          registryUrl: 'https://registry.npmjs.org',
          integrity: 'sha512-test',
          installPath,
          permissions: [],
          lastError: null,
        },
      ]),
    );

    await NpmPluginService.recoverBackups();

    expect(readFileSync(join(root, installPath, 'dist', 'index.js'), 'utf8')).toBe('module.exports = "1.0.0";');
    expect(existsSync(backup)).toBe(false);
  });

  it('skips backup recovery when plugins are not configured', async () => {
    PluginService.configure({ PLUGIN_DIR: '', RESTART_BY_EXIT: true });

    await expect(NpmPluginService.recoverBackups()).resolves.toBeUndefined();
  });

  it('classifies installed versions and calculates their permission delta', async () => {
    const service = new NpmPluginService({} as never);
    writeFileSync(
      join(root, '.npm-plugin-state.json'),
      JSON.stringify([
        {
          name: '@attraccess/plugin',
          version: '1.2.0',
          registryId: 'private',
          registryUrl: 'https://registry.example.com',
          integrity: 'sha512-test',
          installPath: 'npm-plugin',
          permissions: ['DATABASE_ACCESS'],
          lastError: null,
        },
      ]),
    );
    jest.spyOn(service, 'packageMetadata').mockResolvedValue({
      time: {
        '1.1.0': '2026-01-01T00:00:00.000Z',
        '1.2.0': '2026-02-01T00:00:00.000Z',
        '1.3.0': '2026-03-01T00:00:00.000Z',
      },
      versions: {
        '1.1.0': {
          name: '@attraccess/plugin',
          version: '1.1.0',
          keywords: ['attraccess-plugin'],
          peerDependencies: { '@attraccess/plugins-backend-sdk': '*' },
          attraccess: { displayName: 'Plugin', host: '*', backend: 'index.js', permissions: [], sdk: { backend: '*' } },
        },
        '1.2.0': {
          name: '@attraccess/plugin',
          version: '1.2.0',
          keywords: ['attraccess-plugin'],
          peerDependencies: { '@attraccess/plugins-backend-sdk': '*' },
          attraccess: {
            displayName: 'Plugin',
            host: '*',
            backend: 'index.js',
            permissions: ['DATABASE_ACCESS'],
            sdk: { backend: '*' },
          },
        },
        '1.3.0': {
          name: '@attraccess/plugin',
          version: '1.3.0',
          keywords: ['attraccess-plugin'],
          peerDependencies: { '@attraccess/plugins-backend-sdk': '*' },
          attraccess: {
            displayName: 'Plugin',
            host: '*',
            backend: 'index.js',
            permissions: ['DATABASE_ACCESS', 'READ_USERS'],
            sdk: { backend: '*' },
          },
        },
      },
    });
    jest.spyOn(service as unknown as ServiceInternals, 'hostVersion').mockReturnValue('1.9.0');

    await expect(service.installedVersionCandidates('@attraccess/plugin')).resolves.toEqual([
      expect.objectContaining({ version: '1.3.0', direction: 'newer', permissionAdditions: ['READ_USERS'] }),
      expect.objectContaining({ version: '1.2.0', direction: 'current', permissionAdditions: [] }),
      expect.objectContaining({ version: '1.1.0', direction: 'older', permissionRemovals: ['DATABASE_ACCESS'] }),
    ]);
    expect(service.packageMetadata).toHaveBeenCalledWith('@attraccess/plugin', 'private');
  });

  it('requires the exact permission additions before replacing an installed package', async () => {
    const service = new NpmPluginService({} as never);
    writeFileSync(
      join(root, '.npm-plugin-state.json'),
      JSON.stringify([
        {
          name: '@attraccess/plugin',
          version: '1.0.0',
          registryId: 'npm',
          registryUrl: 'https://registry.npmjs.org',
          integrity: 'sha512-test',
          installPath: 'npm-plugin',
          permissions: [],
          lastError: null,
        },
      ]),
    );
    jest.spyOn(service, 'installedVersionCandidates').mockResolvedValue([
      {
        version: '1.1.0',
        publishedAt: null,
        direction: 'newer',
        compatible: true,
        reason: null,
        permissions: ['READ_USERS'],
        permissionAdditions: ['READ_USERS'],
        permissionRemovals: [],
      },
    ]);

    await expect(service.replaceInstalled('@attraccess/plugin', '1.1.0')).rejects.toThrow(
      'Permission approval required for: READ_USERS',
    );
  });

  it('rejects replacing an installed package through the install endpoint', async () => {
    const service = new NpmPluginService({} as never);
    writeFileSync(
      join(root, '.npm-plugin-state.json'),
      JSON.stringify([{ name: '@attraccess/plugin', version: '1.0.0' }]),
    );

    await expect(service.install('@attraccess/plugin', '1.1.0')).rejects.toThrow(
      'Package is already installed; use the replacement endpoint',
    );
  });

  it('requires approval for permissions declared by the downloaded replacement tarball', async () => {
    const name = '@attraccess/plugin';
    const tarball = await packageTarball(name, ['READ_USERS']);
    const service = new NpmPluginService({} as never);
    writeFileSync(
      join(root, '.npm-plugin-state.json'),
      JSON.stringify([
        {
          name,
          version: '1.0.0',
          registryId: 'npm',
          registryUrl: 'https://registry.npmjs.org',
          integrity: 'sha512-test',
          installPath: 'npm-plugin',
          permissions: [],
          lastError: null,
        },
      ]),
    );
    jest.spyOn(service, 'installedVersionCandidates').mockResolvedValue([
      {
        version: '1.2.3',
        publishedAt: null,
        direction: 'newer',
        compatible: true,
        reason: null,
        permissions: [],
        permissionAdditions: [],
        permissionRemovals: [],
      },
    ]);
    jest.spyOn(service, 'packageMetadata').mockResolvedValue({
      versions: {
        '1.2.3': {
          version: '1.2.3',
          dist: { tarball: 'plugin', shasum: createHash('sha1').update(tarball).digest('hex') },
        },
      },
    });
    jest.spyOn(service as unknown as ServiceInternals, 'hostVersion').mockReturnValue('1.9.0');
    jest.spyOn(service as unknown as ServiceInternals, 'download').mockResolvedValue(tarball);

    await expect(service.replaceInstalled(name, '1.2.3', [])).rejects.toThrow(
      'Permission approval required for: READ_USERS',
    );
  });
});
