import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { NpmPluginService } from './npm-plugin.service';
import { setupNpmPluginFixture } from './npm-plugin.test-fixture';
import { PluginMigrationService } from './plugin-migration.service';
import { npmInternals } from './npm/fixtures/compose.test-fixture';
jest.mock('dns/promises', () => ({ lookup: jest.fn() }));

/** npm installs refuse incompatible packages while parsing them: no files, no state row, no plugin code loaded. */
describe('NpmPluginService host compatibility', () => {
  const fixture = setupNpmPluginFixture();
  const name = '@attraccess/legacy';

  /** The registry entry of a version: its package.json (as packed in the tarball) and the tarball's checksum. */
  function versionEntry(version: string, tarball: Buffer, permissions: string[], attraccess = {}) {
    return {
      name,
      version,
      keywords: ['attraccess-plugin'],
      peerDependencies: { '@attraccess/plugins-backend-sdk': '*' },
      attraccess: {
        displayName: name,
        host: '>=2.0.0-0',
        backend: 'dist/index.js',
        permissions,
        sdk: { backend: '*' },
        ...attraccess,
      },
      dist: { tarball: version, shasum: createHash('sha1').update(tarball).digest('hex') },
    };
  }

  function serviceServing(
    tarballs: Record<string, Buffer>,
    entries: Record<string, Record<string, unknown>> = {},
  ): NpmPluginService {
    const service = new NpmPluginService({ getPlainSetting: jest.fn().mockResolvedValue(null) } as never);
    jest.spyOn(npmInternals(service).catalog, 'hostVersion').mockReturnValue('2.0.0');
    const versions = Object.fromEntries(
      Object.entries(tarballs).map(([version, tarball]) => [
        version,
        entries[version] ?? {
          version,
          dist: { tarball: version, shasum: createHash('sha1').update(tarball).digest('hex') },
        },
      ]),
    );
    jest.spyOn(npmInternals(service).catalog, 'packageMetadata').mockResolvedValue({ versions });
    jest.spyOn(npmInternals(service).registry, 'download').mockImplementation(async (url) => tarballs[url]);
    return service;
  }

  const visibleEntries = () => readdirSync(fixture.root).filter((entry) => !entry.startsWith('.'));

  it('refuses an SDK 1.x host range with the plugin name and the migration guide, before any state or file', async () => {
    const tarball = await fixture.packageTarball(name, [], { attraccess: { host: '>=1.0.0' } });
    const service = serviceServing({ '1.2.3': tarball });

    const install = service.install(name, '1.2.3');

    await expect(install).rejects.toBeInstanceOf(BadRequestException);
    await expect(install).rejects.toThrow(/Plugin @attraccess\/legacy .*migrating-to-2/s);
    expect(existsSync(join(fixture.root, '.npm-plugin-state.json'))).toBe(false);
    expect(visibleEntries()).toEqual([]);
    expect(service.listInstalled()).toEqual([]);
  });

  it.each([
    ['declares DATABASE_ACCESS but no persistence.backends', {}, 'declares no persistence.backends'],
    ['supports only another engine', { persistence: { backends: ['postgres'] } }, 'this host runs sqlite'],
  ])('refuses a package that %s before any state or file', async (_case, attraccess, message) => {
    const tarball = await fixture.packageTarball(name, ['DATABASE_ACCESS'], { attraccess });
    const service = serviceServing({ '1.2.3': tarball });

    await expect(service.install(name, '1.2.3')).rejects.toThrow(message);
    expect(existsSync(join(fixture.root, '.npm-plugin-state.json'))).toBe(false);
    expect(visibleEntries()).toEqual([]);
  });

  it('refuses an incompatible replacement without loading its migration code', async () => {
    const current = await fixture.packageTarball(name);
    const replacement = await fixture.packageTarball(name, ['DATABASE_ACCESS'], {
      version: '1.3.0',
      attraccess: { migrations: 'dist/migrations.js', persistence: { backends: ['postgres'] } },
    });
    const service = serviceServing(
      { '1.2.3': current, '1.3.0': replacement },
      {
        '1.2.3': versionEntry('1.2.3', current, []),
        '1.3.0': versionEntry('1.3.0', replacement, ['DATABASE_ACCESS'], {
          migrations: 'dist/migrations.js',
          persistence: { backends: ['postgres'] },
        }),
      },
    );
    await service.install(name, '1.2.3');
    const history = jest.spyOn(PluginMigrationService, 'assertReplacementMigrationHistory');

    await expect(service.replaceInstalled(name, '1.3.0', ['DATABASE_ACCESS'])).rejects.toThrow('this host runs sqlite');

    expect(history).not.toHaveBeenCalled();
    expect(service.listInstalled()).toEqual([expect.objectContaining({ name, version: '1.2.3' })]);
  });
});
