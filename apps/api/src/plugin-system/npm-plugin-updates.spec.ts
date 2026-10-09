import { createHash } from 'crypto';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { NpmPluginService } from './npm-plugin.service';
import type { ServiceInternals } from './npm-plugin.test-fixture';
import { setupNpmPluginFixture } from './npm-plugin.test-fixture';
jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
describe('NpmPluginService', () => {
  const fixture = setupNpmPluginFixture();
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

  it('classifies each version using its own publisher metadata', async () => {
    const service = new NpmPluginService({} as never);
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
      JSON.stringify([
        {
          name: '@attraccess/plugin-example',
          version: '1.0.0',
          registryId: 'npm',
          registryUrl: 'https://registry.npmjs.org',
          integrity: 'sha512-test',
          installPath: 'npm-plugin',
          permissions: [],
          lastError: null,
          publisher: 'attraccess',
        },
      ]),
    );
    jest.spyOn(service, 'packageMetadata').mockResolvedValue({
      publisher: { name: 'attraccess' },
      versions: {
        '1.1.0': {
          name: '@attraccess/plugin-example',
          version: '1.1.0',
          _npmUser: { name: 'unapproved-publisher' },
          keywords: ['attraccess-plugin'],
          peerDependencies: { '@attraccess/plugins-backend-sdk': '*' },
          attraccess: {
            displayName: 'Example',
            host: '*',
            backend: 'index.js',
            permissions: [],
            sdk: { backend: '*' },
          },
        },
      },
    });
    jest.spyOn(service as unknown as ServiceInternals, 'hostVersion').mockReturnValue('1.9.0');

    await expect(service.installedVersionCandidates('@attraccess/plugin-example')).resolves.toEqual([
      expect.objectContaining({
        version: '1.1.0',
        classification: 'community',
        classificationReason: 'Not published by Attraccess on npm',
      }),
    ]);
  });

  it('requires the exact permission additions before replacing an installed package', async () => {
    const service = new NpmPluginService({} as never);
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
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
      join(fixture.root, '.npm-plugin-state.json'),
      JSON.stringify([{ name: '@attraccess/plugin', version: '1.0.0' }]),
    );

    await expect(service.install('@attraccess/plugin', '1.1.0')).rejects.toThrow(
      'Package is already installed; use the replacement endpoint',
    );
  });

  it('requires approval for permissions declared by the downloaded replacement tarball', async () => {
    const name = '@attraccess/plugin';
    const tarball = await fixture.packageTarball(name, ['READ_USERS']);
    const service = new NpmPluginService({} as never);
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
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

  it('records an available patch update without changing the requested range', async () => {
    const name = '@attraccess/plugin';
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
      JSON.stringify([
        {
          name,
          version: '1.2.0',
          requestedSpec: '^1.2.0',
          registryId: 'private',
          registryUrl: 'https://registry.example.com',
          integrity: 'sha512-test',
          installPath: 'npm-plugin',
          permissions: [],
          lastError: null,
        },
      ]),
    );
    const service = new NpmPluginService({ getPlainSetting: jest.fn().mockResolvedValue(null) } as never);
    jest.spyOn(service, 'installedVersionCandidates').mockResolvedValue([
      {
        version: '1.2.1',
        direction: 'newer',
        compatible: true,
        reason: null,
        permissions: [],
        permissionAdditions: [],
        permissionRemovals: [],
        publishedAt: null,
        classification: 'community',
        classificationReason: '',
        deprecated: null,
        integrity: 'sha512-test',
        repository: null,
        homepage: null,
        semverImpact: 'patch',
        matchesRequestedSpec: true,
      },
    ]);

    await expect(service.checkInstalled(name)).resolves.toMatchObject({
      requestedSpec: '^1.2.0',
      updateCheck: { candidate: '1.2.1', state: 'available', error: null },
    });
  });

  it('requires explicit approval before replacing an installed package with a major version', async () => {
    const service = new NpmPluginService({} as never);
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
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
        version: '2.0.0',
        direction: 'newer',
        compatible: true,
        reason: null,
        permissions: [],
        permissionAdditions: [],
        permissionRemovals: [],
        publishedAt: null,
        classification: 'community',
        classificationReason: '',
        deprecated: null,
        integrity: 'sha512-test',
        repository: null,
        homepage: null,
        semverImpact: 'major',
        matchesRequestedSpec: true,
      },
    ]);

    await expect(service.replaceInstalled('@attraccess/plugin', '2.0.0')).rejects.toThrow(
      'Explicit approval is required for a major version update',
    );
  });

  it('classifies a major prerelease as a major update', async () => {
    const service = new NpmPluginService({} as never);
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
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
    jest.spyOn(service, 'packageMetadata').mockResolvedValue({
      versions: {
        '2.0.0-beta.1': {
          name: '@attraccess/plugin',
          version: '2.0.0-beta.1',
          keywords: ['attraccess-plugin'],
          peerDependencies: { '@attraccess/plugins-backend-sdk': '*' },
          attraccess: { displayName: 'Plugin', host: '*', backend: 'index.js', permissions: [], sdk: { backend: '*' } },
        },
      },
    });
    jest.spyOn(service as unknown as ServiceInternals, 'hostVersion').mockReturnValue('1.9.0');

    await expect(service.installedVersionCandidates('@attraccess/plugin')).resolves.toEqual([
      expect.objectContaining({ version: '2.0.0-beta.1', semverImpact: 'major' }),
    ]);
  });

  it('allows prerelease candidates that match a follow range when enabled by policy', async () => {
    const name = '@attraccess/plugin';
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
      JSON.stringify([
        {
          name,
          version: '2.0.0-beta.1',
          requestedSpec: '^2.0.0-beta.1',
          registryId: 'npm',
          registryUrl: 'https://registry.npmjs.org',
          integrity: 'sha512-test',
          installPath: 'npm-plugin',
          permissions: [],
          lastError: null,
        },
      ]),
    );
    const service = new NpmPluginService({
      getPlainSetting: jest.fn().mockResolvedValue(
        JSON.stringify({
          checksEnabled: true,
          mode: 'follow',
          prerelease: true,
          maintenanceWindow: { startMinute: 0, durationMinutes: 60 },
        }),
      ),
    } as never);
    jest.spyOn(service, 'installedVersionCandidates').mockResolvedValue([
      {
        version: '2.0.0-beta.2',
        direction: 'newer',
        compatible: true,
        reason: null,
        permissions: [],
        permissionAdditions: [],
        permissionRemovals: [],
        publishedAt: null,
        classification: 'community',
        classificationReason: '',
        deprecated: null,
        integrity: 'sha512-test',
        repository: null,
        homepage: null,
        semverImpact: 'prerelease',
        matchesRequestedSpec: false,
      },
    ]);

    await expect(service.checkInstalled(name)).resolves.toMatchObject({
      updateCheck: { candidate: '2.0.0-beta.2', state: 'available' },
    });
  });

  it('follows a configured dist-tag when selecting an update candidate', async () => {
    const name = '@attraccess/plugin';
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
      JSON.stringify([
        {
          name,
          version: '1.0.0',
          requestedSpec: 'next',
          registryId: 'npm',
          registryUrl: 'https://registry.npmjs.org',
          integrity: 'sha512-test',
          installPath: 'npm-plugin',
          permissions: [],
          lastError: null,
        },
      ]),
    );
    const service = new NpmPluginService({
      getPlainSetting: jest.fn().mockResolvedValue(
        JSON.stringify({
          checksEnabled: true,
          mode: 'follow',
          prerelease: false,
          maintenanceWindow: { startMinute: 0, durationMinutes: 60 },
        }),
      ),
    } as never);
    jest.spyOn(service, 'packageMetadata').mockResolvedValue({
      'dist-tags': { next: '1.1.0' },
      versions: { '1.1.0': { version: '1.1.0' } },
    });
    jest.spyOn(service, 'installedVersionCandidates').mockResolvedValue([
      {
        version: '1.2.0',
        direction: 'newer',
        compatible: true,
        reason: null,
        permissions: [],
        permissionAdditions: [],
        permissionRemovals: [],
        publishedAt: null,
        classification: 'community',
        classificationReason: '',
        deprecated: null,
        integrity: 'sha512-test',
        repository: null,
        homepage: null,
        semverImpact: 'minor',
        matchesRequestedSpec: false,
      },
      {
        version: '1.1.0',
        direction: 'newer',
        compatible: true,
        reason: null,
        permissions: [],
        permissionAdditions: [],
        permissionRemovals: [],
        publishedAt: null,
        classification: 'community',
        classificationReason: '',
        deprecated: null,
        integrity: 'sha512-test',
        repository: null,
        homepage: null,
        semverImpact: 'minor',
        matchesRequestedSpec: false,
      },
    ]);

    await expect(service.checkInstalled(name)).resolves.toMatchObject({
      updateCheck: { candidate: '1.1.0', state: 'available' },
    });
  });

  it('skips registry update checks when checks are disabled globally', async () => {
    const name = '@attraccess/plugin';
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
      JSON.stringify([
        {
          name,
          version: '1.0.0',
          requestedSpec: '^1.0.0',
          registryId: 'npm',
          registryUrl: 'https://registry.npmjs.org',
          integrity: 'sha512-test',
          installPath: 'npm-plugin',
          permissions: [],
          lastError: null,
        },
      ]),
    );
    const service = new NpmPluginService({
      getPlainSetting: jest.fn().mockResolvedValue(
        JSON.stringify({
          checksEnabled: false,
          mode: 'patch',
          prerelease: false,
          maintenanceWindow: { startMinute: 0, durationMinutes: 60 },
        }),
      ),
    } as never);
    const candidates = jest.spyOn(service, 'installedVersionCandidates');

    await expect(service.checkInstalled(name)).resolves.toMatchObject({
      name,
      updateCheck: null,
    });
    expect(candidates).not.toHaveBeenCalled();
  });

  it('records a failed update check when reading the update policy fails', async () => {
    const name = '@attraccess/plugin';
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
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
    const service = new NpmPluginService({
      getPlainSetting: jest.fn().mockRejectedValue(new Error('Settings unavailable')),
    } as never);

    await expect(service.checkInstalled(name)).resolves.toMatchObject({
      updateCheck: { state: 'failed', error: 'Settings unavailable' },
    });
  });

  it('preserves concurrent install policy changes while recording an update check', async () => {
    const name = '@attraccess/plugin';
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
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
    const service = new NpmPluginService({ getPlainSetting: jest.fn().mockResolvedValue(null) } as never);
    let releaseCandidates: ((value: never[]) => void) | undefined;
    jest.spyOn(service, 'installedVersionCandidates').mockReturnValue(
      new Promise((resolve) => {
        releaseCandidates = resolve;
      }),
    );

    const updateCheck = service.checkInstalled(name);
    await service.updateOverride(name, 'off');
    if (!releaseCandidates) throw new Error('Expected update check to request candidates');
    releaseCandidates([
      {
        version: '1.0.1',
        direction: 'newer',
        compatible: true,
        reason: null,
        permissions: [],
        permissionAdditions: [],
        permissionRemovals: [],
        publishedAt: null,
        classification: 'community',
        classificationReason: '',
        deprecated: null,
        integrity: 'sha512-test',
        repository: null,
        homepage: null,
        semverImpact: 'patch',
        matchesRequestedSpec: true,
      },
    ] as never);

    await expect(updateCheck).resolves.toMatchObject({ updateOverride: 'off', updateCheck: { state: 'blocked' } });
  });

  it('retries an update check after the global policy changes', async () => {
    const name = '@attraccess/plugin';
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
      JSON.stringify([
        {
          name,
          version: '1.0.0',
          requestedSpec: '^1.0.0',
          registryId: 'npm',
          registryUrl: 'https://registry.npmjs.org',
          integrity: 'sha512-test',
          installPath: 'npm-plugin',
          permissions: [],
          lastError: null,
        },
      ]),
    );
    let rawPolicy = JSON.stringify({
      checksEnabled: true,
      mode: 'patch',
      prerelease: false,
      maintenanceWindow: { startMinute: 0, durationMinutes: 60 },
    });
    const service = new NpmPluginService({
      getPlainSetting: jest.fn().mockImplementation(async () => rawPolicy),
      setPlainSetting: jest.fn().mockImplementation(async (_parent, _key, value) => {
        rawPolicy = value;
      }),
    } as never);
    let releaseCandidates: ((value: never[]) => void) | undefined;
    jest
      .spyOn(service, 'installedVersionCandidates')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseCandidates = resolve;
          }),
      )
      .mockResolvedValue([
        {
          version: '1.0.1',
          direction: 'newer',
          compatible: true,
          reason: null,
          permissions: [],
          permissionAdditions: [],
          permissionRemovals: [],
          publishedAt: null,
          classification: 'community',
          classificationReason: '',
          deprecated: null,
          integrity: 'sha512-test',
          repository: null,
          homepage: null,
          semverImpact: 'patch',
          matchesRequestedSpec: true,
        },
      ] as never);

    const updateCheck = service.checkInstalled(name);
    await new Promise((resolve) => setImmediate(resolve));
    await service.setUpdatePolicy({ mode: 'off' });
    if (!releaseCandidates) throw new Error('Expected update check to request candidates');
    releaseCandidates([]);

    await expect(updateCheck).resolves.toMatchObject({ updateCheck: { state: 'blocked' } });
  });

  it('retries a failed update check after the installation spec changes', async () => {
    const name = '@attraccess/plugin';
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
      JSON.stringify([
        {
          name,
          version: '1.0.0',
          requestedSpec: '^1.0.0',
          registryId: 'npm',
          registryUrl: 'https://registry.npmjs.org',
          integrity: 'sha512-test',
          installPath: 'npm-plugin',
          permissions: [],
          lastError: null,
        },
      ]),
    );
    const service = new NpmPluginService({ getPlainSetting: jest.fn().mockResolvedValue(null) } as never);
    jest.spyOn(service, 'packageMetadata').mockResolvedValue({
      versions: { '1.1.0': { version: '1.1.0' } },
    });
    let rejectCandidates: ((error: Error) => void) | undefined;
    jest
      .spyOn(service, 'installedVersionCandidates')
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectCandidates = reject;
          }),
      )
      .mockResolvedValue([]);

    const updateCheck = service.checkInstalled(name);
    await new Promise((resolve) => setImmediate(resolve));
    await service.updateRequestedSpec(name, '^1.1.0');
    if (!rejectCandidates) throw new Error('Expected update check to request candidates');
    rejectCandidates(new Error('Registry unavailable'));

    await expect(updateCheck).resolves.toMatchObject({
      requestedSpec: '^1.1.0',
      updateCheck: { state: 'up-to-date', error: null },
    });
  });

  it('retries a dist-tag update check after its requested spec changes', async () => {
    const name = '@attraccess/plugin';
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
      JSON.stringify([
        {
          name,
          version: '1.0.0',
          requestedSpec: 'next',
          registryId: 'npm',
          registryUrl: 'https://registry.npmjs.org',
          integrity: 'sha512-test',
          installPath: 'npm-plugin',
          permissions: [],
          lastError: null,
        },
      ]),
    );
    const service = new NpmPluginService({
      getPlainSetting: jest.fn().mockResolvedValue(
        JSON.stringify({
          checksEnabled: true,
          mode: 'follow',
          prerelease: false,
          maintenanceWindow: { startMinute: 0, durationMinutes: 60 },
        }),
      ),
    } as never);
    jest.spyOn(service, 'installedVersionCandidates').mockResolvedValue([
      {
        version: '1.2.0',
        direction: 'newer',
        compatible: true,
        reason: null,
        permissions: [],
        permissionAdditions: [],
        permissionRemovals: [],
        publishedAt: null,
        classification: 'community',
        classificationReason: '',
        deprecated: null,
        integrity: 'sha512-test',
        repository: null,
        homepage: null,
        semverImpact: 'minor',
        matchesRequestedSpec: false,
      },
    ]);
    let resolveNext: ((value: unknown) => void) | undefined;
    jest.spyOn(service, 'packageMetadata').mockImplementation(async () => {
      if (!resolveNext)
        return new Promise((resolve) => {
          resolveNext = resolve;
        });
      return { 'dist-tags': { latest: '1.2.0' }, versions: { '1.2.0': { version: '1.2.0' } } };
    });

    const updateCheck = service.checkInstalled(name);
    await new Promise((resolve) => setImmediate(resolve));
    const requestedSpecUpdate = service.updateRequestedSpec(name, 'latest');
    await new Promise((resolve) => setImmediate(resolve));
    resolveNext?.({ 'dist-tags': { next: '1.1.0' }, versions: { '1.1.0': { version: '1.1.0' } } });
    await requestedSpecUpdate;

    await expect(updateCheck).resolves.toMatchObject({
      requestedSpec: 'latest',
      updateCheck: { candidate: '1.2.0', state: 'available' },
    });
  });

  it('uses an explicit per-plugin update mode instead of the global mode', async () => {
    const name = '@attraccess/plugin';
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
      JSON.stringify([
        {
          name,
          version: '1.0.0',
          requestedSpec: '^1.0.0',
          updateOverride: 'minor',
          registryId: 'npm',
          registryUrl: 'https://registry.npmjs.org',
          integrity: 'sha512-test',
          installPath: 'npm-plugin',
          permissions: [],
          lastError: null,
        },
      ]),
    );
    const service = new NpmPluginService({
      getPlainSetting: jest.fn().mockResolvedValue(
        JSON.stringify({
          checksEnabled: true,
          mode: 'patch',
          prerelease: false,
          maintenanceWindow: { startMinute: 0, durationMinutes: 60 },
        }),
      ),
    } as never);
    jest.spyOn(service, 'installedVersionCandidates').mockResolvedValue([
      {
        version: '1.1.0',
        direction: 'newer',
        compatible: true,
        reason: null,
        permissions: [],
        permissionAdditions: [],
        permissionRemovals: [],
        publishedAt: null,
        classification: 'community',
        classificationReason: '',
        deprecated: null,
        integrity: 'sha512-test',
        repository: null,
        homepage: null,
        semverImpact: 'minor',
        matchesRequestedSpec: true,
      },
    ]);

    await expect(service.checkInstalled(name)).resolves.toMatchObject({
      updateCheck: { candidate: '1.1.0', state: 'available' },
    });
  });

  it('limits simultaneous update checks to four installations', async () => {
    const service = new NpmPluginService({} as never);
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
      JSON.stringify(
        Array.from({ length: 5 }, (_, index) => ({ name: `@attraccess/plugin-${index}`, version: '1.0.0' })),
      ),
    );
    let active = 0;
    let maximum = 0;
    jest.spyOn(service, 'checkInstalled').mockImplementation(async (name) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return { name } as never;
    });

    await service.checkAllInstalled();

    expect(maximum).toBe(4);
  });
});
