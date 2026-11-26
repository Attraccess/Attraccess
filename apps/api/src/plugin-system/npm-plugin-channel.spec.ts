import { writeFileSync } from 'fs';
import { join } from 'path';
import { NpmPluginService } from './npm-plugin.service';
import type { ServiceInternals } from './npm-plugin.test-fixture';
import { setupNpmPluginFixture } from './npm-plugin.test-fixture';
import { npmInternals } from './npm/fixtures/compose.test-fixture';
import { eligibleForPolicy, type InstalledNpmPlugin, type InstalledNpmPluginVersion } from './npm/package-models';
import { DEFAULT_PLUGIN_UPDATE_POLICY } from './npm-plugin.service';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));

const NAME = '@attraccess/plugin-demo';

function published(version: string, host = '>=2.0.0-0') {
  return {
    name: NAME,
    version,
    keywords: ['attraccess-plugin'],
    peerDependencies: { '@attraccess/plugins-backend-sdk': '*' },
    attraccess: { displayName: 'Demo', host, backend: 'index.js', permissions: [], sdk: { backend: '*' } },
  };
}

function metadata(versions: Record<string, ReturnType<typeof published>>, tags: Record<string, string>) {
  return { name: NAME, 'dist-tags': tags, versions };
}

describe('plugin channel', () => {
  const fixture = setupNpmPluginFixture();
  const previousChannel = process.env.ATTRACCESS_PLUGIN_CHANNEL;

  function serviceWith(meta: unknown, channel: 'latest' | 'next', settings: unknown = {}) {
    process.env.ATTRACCESS_PLUGIN_CHANNEL = channel;
    const service = new NpmPluginService(settings as never);
    const internals = npmInternals(service);
    jest.spyOn(internals.catalog, 'packageMetadata').mockResolvedValue(meta);
    jest.spyOn(internals.catalog as unknown as ServiceInternals, 'hostVersion').mockReturnValue('2.0.0');
    return { service, internals };
  }

  afterEach(() => {
    if (previousChannel === undefined) delete process.env.ATTRACCESS_PLUGIN_CHANNEL;
    else process.env.ATTRACCESS_PLUGIN_CHANNEL = previousChannel;
  });

  const stable = published('0.2.1');
  const nightly = published('0.3.0-nightly.5.1');

  describe('marketplace and install resolution', () => {
    it('keeps using latest on a latest host', async () => {
      const { service } = serviceWith(
        metadata({ '0.2.1': stable, '0.3.0-nightly.5.1': nightly }, { latest: '0.2.1', next: '0.3.0-nightly.5.1' }),
        'latest',
      );
      await expect(service.marketplacePackage(NAME)).resolves.toMatchObject({ version: '0.2.1', installable: true });
    });

    it('offers the higher of next and latest on a next host', async () => {
      const { service } = serviceWith(
        metadata({ '0.2.1': stable, '0.3.0-nightly.5.1': nightly }, { latest: '0.2.1', next: '0.3.0-nightly.5.1' }),
        'next',
      );
      await expect(service.marketplacePackage(NAME)).resolves.toMatchObject({ version: '0.3.0-nightly.5.1' });
    });

    it('offers latest when it is higher than next', async () => {
      const { service } = serviceWith(
        metadata(
          { '0.3.0': published('0.3.0'), '0.3.0-nightly.5.1': nightly },
          { latest: '0.3.0', next: '0.3.0-nightly.5.1' },
        ),
        'next',
      );
      await expect(service.marketplacePackage(NAME)).resolves.toMatchObject({ version: '0.3.0' });
    });

    it('falls back to latest without a next tag', async () => {
      const { service } = serviceWith(metadata({ '0.2.1': stable }, { latest: '0.2.1' }), 'next');
      await expect(service.marketplacePackage(NAME)).resolves.toMatchObject({ version: '0.2.1' });
    });

    it('falls back to latest when next needs a newer host', async () => {
      const { service } = serviceWith(
        metadata(
          { '0.2.1': stable, '0.3.0-nightly.5.1': published('0.3.0-nightly.5.1', '>=9.0.0') },
          { latest: '0.2.1', next: '0.3.0-nightly.5.1' },
        ),
        'next',
      );
      await expect(service.marketplacePackage(NAME)).resolves.toMatchObject({ version: '0.2.1' });
    });

    it('resolves the install plan default through the channel and an explicit spec unchanged', async () => {
      const meta = metadata(
        { '0.2.1': stable, '0.3.0-nightly.5.1': nightly },
        { latest: '0.2.1', next: '0.3.0-nightly.5.1' },
      );
      const { internals } = serviceWith(meta, 'next');
      await expect(
        internals.plan.resolveVersion(NAME, undefined, { id: 'npm', url: 'u' } as never),
      ).resolves.toMatchObject({
        version: '0.3.0-nightly.5.1',
      });
      await expect(
        internals.plan.resolveVersion(NAME, 'latest', { id: 'npm', url: 'u' } as never),
      ).resolves.toMatchObject({
        version: '0.2.1',
      });
      await expect(
        internals.plan.resolveVersion(NAME, '0.2.1', { id: 'npm', url: 'u' } as never),
      ).resolves.toMatchObject({
        version: '0.2.1',
      });
    });

    it('resolves the next spec through the channel on a next host, even without a next tag', async () => {
      const { internals } = serviceWith(metadata({ '0.2.1': stable }, { latest: '0.2.1' }), 'next');
      await expect(
        internals.plan.resolveVersion(NAME, 'next', { id: 'npm', url: 'u' } as never),
      ).resolves.toMatchObject({
        version: '0.2.1',
      });
    });
  });

  describe('install', () => {
    function stubInstall(channel: 'latest' | 'next') {
      const { service, internals } = serviceWith(
        metadata({ '0.2.1': stable, '0.3.0-nightly.5.1': nightly }, { latest: '0.2.1', next: '0.3.0-nightly.5.1' }),
        channel,
      );
      jest
        .spyOn(internals.registry, 'registry')
        .mockResolvedValue({ id: 'npm', name: 'npm', url: 'https://r' } as never);
      jest.spyOn(internals.plan, 'installPlan').mockResolvedValue({ plugins: [{ name: NAME }] } as never);
      const installFromRegistry = jest
        .spyOn(internals.installation, 'installFromRegistry')
        .mockResolvedValue({} as never);
      return { service, installFromRegistry };
    }

    it('records the host channel as requested spec for an install without a spec', async () => {
      const { service, installFromRegistry } = stubInstall('next');
      await service.install(NAME, undefined);
      expect(installFromRegistry).toHaveBeenCalledWith(
        NAME,
        '0.3.0-nightly.5.1',
        expect.anything(),
        undefined,
        [],
        'next',
        expect.anything(),
        undefined,
      );
    });

    it('records an explicit spec unchanged', async () => {
      const { service, installFromRegistry } = stubInstall('next');
      await service.install(NAME, 'latest');
      expect(installFromRegistry).toHaveBeenCalledWith(
        NAME,
        '0.2.1',
        expect.anything(),
        undefined,
        [],
        'latest',
        expect.anything(),
        undefined,
      );
    });

    it('records latest on a latest host', async () => {
      const { service, installFromRegistry } = stubInstall('latest');
      await service.install(NAME, undefined);
      expect(installFromRegistry).toHaveBeenCalledWith(
        NAME,
        '0.2.1',
        expect.anything(),
        undefined,
        [],
        'latest',
        expect.anything(),
        undefined,
      );
    });
  });

  describe('update policy', () => {
    const installed = (requestedSpec: string, updateOverride?: InstalledNpmPlugin['updateOverride']) =>
      ({ requestedSpec, version: '0.3.0-nightly.4.1', updateOverride }) as InstalledNpmPlugin;
    const candidate = (version: string, overrides: Partial<InstalledNpmPluginVersion> = {}) =>
      ({
        version,
        semverImpact: 'prerelease',
        deprecated: null,
        permissionAdditions: [],
        ...overrides,
      }) as InstalledNpmPluginVersion;
    const policy = { ...DEFAULT_PLUGIN_UPDATE_POLICY, prerelease: true };
    const next = '0.3.0-nightly.5.1';

    it('lets a plugin requesting next follow a newer nightly under the host default', () => {
      expect(eligibleForPolicy(candidate(next), installed('next'), policy, next, true)).toBe(true);
    });

    it('lets it step from a nightly to the release', () => {
      expect(
        eligibleForPolicy(candidate('0.3.0', { semverImpact: 'patch' }), installed('next'), policy, '0.3.0', true),
      ).toBe(true);
    });

    it('keeps a plugin installed as latest off nightlies', () => {
      expect(eligibleForPolicy(candidate(next), installed('latest'), policy, 'latest-resolved', true)).toBe(false);
      expect(
        eligibleForPolicy(candidate(next, { semverImpact: 'minor' }), installed('^0.2.0'), policy, undefined, true),
      ).toBe(false);
    });

    it('only offers the newest build of the channel', () => {
      expect(eligibleForPolicy(candidate('0.3.0-nightly.4.9'), installed('next'), policy, next, true)).toBe(false);
    });

    it.each([
      ['permission additions', { permissionAdditions: ['READ_USERS'] }],
      ['a major jump', { semverImpact: 'major' as const }],
      ['a deprecated version', { deprecated: 'broken' }],
    ])('still blocks %s', (_label, overrides) => {
      expect(eligibleForPolicy(candidate(next, overrides), installed('next'), policy, next, true)).toBe(false);
    });

    it.each(['off', 'patch'] as const)('respects the %s override', (override) => {
      expect(eligibleForPolicy(candidate(next), installed('next', override), policy, next, true)).toBe(false);
    });

    it('does not apply to an explicitly saved policy', () => {
      expect(eligibleForPolicy(candidate(next), installed('next'), DEFAULT_PLUGIN_UPDATE_POLICY, next, false)).toBe(
        false,
      );
      expect(eligibleForPolicy(candidate(next), installed('next'), policy, next, false)).toBe(false);
    });

    it('treats a missing stored policy as the channel default and a stored one as explicit', async () => {
      process.env.ATTRACCESS_PLUGIN_CHANNEL = 'next';
      const getPlainSetting = jest.fn().mockResolvedValue(undefined);
      const { service } = serviceWith({}, 'next', { getPlainSetting });
      await expect(service.getUpdatePolicy()).resolves.toMatchObject({ mode: 'minor', prerelease: true });
      getPlainSetting.mockResolvedValue(
        JSON.stringify({
          mode: 'minor',
          checksEnabled: true,
          prerelease: false,
          maintenanceWindow: { startMinute: 0, durationMinutes: 60 },
        }),
      );
      await expect(service.getUpdatePolicy()).resolves.toMatchObject({ prerelease: false });
    });

    it('keeps the stable default on a latest host', async () => {
      const { service } = serviceWith({}, 'latest', { getPlainSetting: jest.fn().mockResolvedValue(undefined) });
      await expect(service.getUpdatePolicy()).resolves.toEqual(DEFAULT_PLUGIN_UPDATE_POLICY);
    });

    it('offers the newest nightly to an installed next plugin end to end', async () => {
      const { service, internals } = serviceWith(
        metadata(
          { '0.3.0-nightly.4.1': published('0.3.0-nightly.4.1'), [next]: published(next) },
          { latest: '0.3.0-nightly.4.1', next },
        ),
        'next',
        { getPlainSetting: jest.fn().mockResolvedValue(undefined) },
      );
      writeFileSync(
        join(fixture.root, '.npm-plugin-state.json'),
        JSON.stringify([
          {
            name: NAME,
            version: '0.3.0-nightly.4.1',
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
      jest
        .spyOn(internals.registry, 'registry')
        .mockResolvedValue({ id: 'npm', name: 'npm', url: 'https://r' } as never);
      await expect(service.checkInstalled(NAME)).resolves.toMatchObject({
        updateCheck: { state: 'available', candidate: next },
      });
    });
  });
});
