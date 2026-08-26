import { createHash } from 'crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import * as tar from 'tar';
import { PluginService } from './plugin.service';
import { NpmPluginService } from './npm-plugin.service';

type ServiceInternals = {
  download(url: string): Promise<Buffer>;
  hostVersion(): string;
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
