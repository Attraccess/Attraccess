import type { ServiceInternals } from './npm-plugin.service.npm-plugin-service.test-fixture';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerClassifiesInstalledVersionsAndCalculatesTheirPermissionDeltaCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('classifies installed versions and calculates their permission delta', async () => {
    const service = new NpmPluginService({} as never);
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
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
}
