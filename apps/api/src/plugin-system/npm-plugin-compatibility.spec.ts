import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
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
    await expect(install).rejects.toThrow(/declare an attraccess\.host range in package\.json/);
    expect(existsSync(join(fixture.root, '.npm-plugin-state.json'))).toBe(false);
    expect(visibleEntries()).toEqual([]);
    expect(service.listInstalled()).toEqual([]);
  });

  it('refuses a package whose backend bundle imports TypeORM, before any state or file', async () => {
    const tarball = await fixture.packageTarball(name, [], { backendSource: "const orm = require('typeorm');" });
    const service = serviceServing({ '1.2.3': tarball });

    const install = service.install(name, '1.2.3');

    await expect(install).rejects.toBeInstanceOf(BadRequestException);
    await expect(install).rejects.toThrow(
      /Plugin @attraccess\/legacy imports "typeorm" \(in index\.js\).*Migration guide: .*migrating-to-2/s,
    );
    expect(existsSync(join(fixture.root, '.npm-plugin-state.json'))).toBe(false);
    expect(visibleEntries()).toEqual([]);
    expect(service.listInstalled()).toEqual([]);
  });

  it('refuses a package whose storage namespace another installed plugin has, before any state or file', async () => {
    mkdirSync(join(fixture.root, 'attraccess-legacy'));
    writeFileSync(
      join(fixture.root, 'attraccess-legacy', 'plugin.json'),
      JSON.stringify({
        name: 'attraccess_legacy',
        version: '1.0.0',
        main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
        attraccessVersion: { min: '2.0.0-0' },
        permissions: ['PLUGIN_STORAGE'],
      }),
    );
    const tarball = await fixture.packageTarball(name, ['PLUGIN_STORAGE']);
    const service = serviceServing({ '1.2.3': tarball });

    const install = service.install(name, '1.2.3');

    await expect(install).rejects.toBeInstanceOf(BadRequestException);
    await expect(install).rejects.toThrow(
      /Plugin "@attraccess\/legacy" .*namespace "attraccess_legacy" is the one of the installed plugin "attraccess_legacy"/,
    );
    expect(existsSync(join(fixture.root, '.npm-plugin-state.json'))).toBe(false);
    expect(visibleEntries()).toEqual(['attraccess-legacy']);
    expect(service.listInstalled()).toEqual([]);
  });

  it.each([
    ['requests the removed DATABASE_ACCESS permission', ['DATABASE_ACCESS'], {}, 'DATABASE_ACCESS permission'],
    [
      'declares persistence.backends',
      [],
      { persistence: { backends: ['sqlite'] } },
      'declares attraccess.persistence in package.json',
    ],
    [
      'ships a TypeORM migrations entry',
      [],
      { migrations: 'dist/migrations.js' },
      'migrations entry (attraccess.migrations in package.json)',
    ],
  ])(
    'refuses a package that %s with the plugin name and the migration guide, before any state or file',
    async (_case, permissions, attraccess, message) => {
      const tarball = await fixture.packageTarball(name, permissions, { attraccess });
      const service = serviceServing({ '1.2.3': tarball });

      const install = service.install(name, '1.2.3');

      await expect(install).rejects.toBeInstanceOf(BadRequestException);
      await expect(install).rejects.toThrow(message);
      await expect(install).rejects.toThrow(/Plugin @attraccess\/legacy .*migrating-to-2/s);
      await expect(install).rejects.not.toThrow(/plugin\.json|main\.migrations/);
      expect(existsSync(join(fixture.root, '.npm-plugin-state.json'))).toBe(false);
      expect(visibleEntries()).toEqual([]);
    },
  );

  it('refuses a replacement that still uses database access without reading its storage history', async () => {
    const current = await fixture.packageTarball(name);
    const replacement = await fixture.packageTarball(name, ['DATABASE_ACCESS'], { version: '1.3.0' });
    const service = serviceServing(
      { '1.2.3': current, '1.3.0': replacement },
      {
        '1.2.3': versionEntry('1.2.3', current, []),
        '1.3.0': versionEntry('1.3.0', replacement, ['DATABASE_ACCESS']),
      },
    );
    await service.install(name, '1.2.3');
    const history = jest.spyOn(PluginMigrationService, 'assertReplacementMigrationHistory');

    await expect(service.replaceInstalled(name, '1.3.0', ['DATABASE_ACCESS'])).rejects.toThrow(
      'DATABASE_ACCESS permission',
    );

    expect(history).not.toHaveBeenCalled();
    expect(service.listInstalled()).toEqual([expect.objectContaining({ name, version: '1.2.3' })]);
  });
});
