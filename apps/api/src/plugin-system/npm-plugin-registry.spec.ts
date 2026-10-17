import axios from 'axios';
import { MAX_CONFIGURED_REGISTRIES, NpmPluginService } from './npm-plugin.service';
import type { ServiceInternals, SettingsMock } from './npm-plugin.test-fixture';
import { setupNpmPluginFixture } from './npm-plugin.test-fixture';
jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
describe('NpmPluginService', () => {
  const fixture = setupNpmPluginFixture();
  it('pins tarball DNS on every same-origin redirect and returns archive bytes', async () => {
    const service = new NpmPluginService({} as never) as unknown as {
      download: (url: string, registry: { url: string; token: string | null }) => Promise<Buffer>;
    };
    fixture.lookupAll.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);
    const get = jest
      .spyOn(axios, 'get')
      .mockResolvedValueOnce({ status: 302, headers: { location: '/archive.tgz' } })
      .mockResolvedValueOnce({ status: 200, data: Buffer.from('archive') });
    expect(
      await service.download('https://registry.npmjs.org/start', {
        url: 'https://registry.npmjs.org',
        token: 'test-token',
      }),
    ).toEqual(Buffer.from('archive'));
    expect(get).toHaveBeenNthCalledWith(
      2,
      'https://registry.npmjs.org/archive.tgz',
      expect.objectContaining({ maxRedirects: 0, headers: { authorization: 'Bearer test-token' } }),
    );
    const options = get.mock.calls[0][1];
    const callback = jest.fn();
    if (!options?.lookup) throw new Error('Missing pinned lookup');
    options.lookup('registry.npmjs.org', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '1.1.1.1', 4);
    options.lookup('other.example', {}, callback);
    expect(callback).toHaveBeenLastCalledWith(expect.any(Error), '', 4);
    expect(options.validateStatus?.(200)).toBe(true);
    expect(options.validateStatus?.(404)).toBe(false);
  });

  it('rejects tarball redirects without destinations, across origins, or beyond the limit', async () => {
    const service = new NpmPluginService({} as never) as unknown as {
      download: (url: string, registry: { url: string; token: string | null }) => Promise<Buffer>;
    };
    const registry = { url: 'https://registry.npmjs.org', token: null };
    fixture.lookupAll.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);
    const get = jest.spyOn(axios, 'get').mockResolvedValueOnce({ status: 302, headers: {} });
    await expect(service.download(registry.url, registry)).rejects.toThrow('no destination');
    get.mockResolvedValueOnce({ status: 302, headers: { location: 'https://other.example/archive' } });
    await expect(service.download(registry.url, registry)).rejects.toThrow('configured registry origin');
    get.mockResolvedValue({ status: 302, headers: { location: '/again' } });
    await expect(service.download(registry.url, registry)).rejects.toThrow('redirect limit');
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
    fixture.lookupAll.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);

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

  it('returns invalid search candidates with an actionable incompatibility reason', async () => {
    const service = new NpmPluginService({
      getPlainSetting: jest.fn().mockResolvedValue(null),
    } as never);
    const internals = service as unknown as ServiceInternals;
    jest.spyOn(internals, 'hostVersion').mockReturnValue('1.9.0');
    fixture.lookupAll.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        objects: [
          {
            package: {
              name: '@example/not-a-plugin',
              version: '1.2.3',
            },
          },
        ],
      },
    });
    jest.spyOn(service, 'packageMetadata').mockResolvedValue({
      'dist-tags': { latest: '1.2.3' },
      versions: {
        '1.2.3': {
          name: '@example/not-a-plugin',
          version: '1.2.3',
          keywords: [],
          attraccess: { displayName: 'Not a plugin', host: '*', official: true },
        },
      },
    });

    await expect(service.searchMarketplace('example')).resolves.toEqual({
      results: [
        expect.objectContaining({
          name: '@example/not-a-plugin',
          installable: false,
          incompatibilityReason: 'Package must include the attraccess-plugin keyword',
          classification: 'community',
        }),
      ],
      errors: [],
    });
  });

  it('hydrates abbreviated search results before validating marketplace packages', async () => {
    const service = new NpmPluginService({ getPlainSetting: jest.fn().mockResolvedValue(null) } as never);
    const internals = service as unknown as ServiceInternals;
    jest.spyOn(internals, 'hostVersion').mockReturnValue('1.9.0');
    fixture.lookupAll.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        objects: [{ package: { name: '@example/plugin', version: '1.2.3' } }],
      },
    });
    jest.spyOn(service, 'packageMetadata').mockResolvedValue({
      'dist-tags': { latest: '1.2.3' },
      versions: {
        '1.2.3': {
          name: '@example/plugin',
          version: '1.2.3',
          keywords: ['attraccess-plugin'],
          peerDependencies: { '@attraccess/plugins-backend-sdk': '*' },
          attraccess: {
            displayName: 'Example Plugin',
            host: '*',
            backend: 'dist/index.js',
            sdk: { backend: '*' },
            permissions: [],
          },
        },
      },
    });

    await expect(service.searchMarketplace('example')).resolves.toMatchObject({
      results: [expect.objectContaining({ name: '@example/plugin', installable: true, provenance: null })],
      errors: [],
    });
    expect(service.packageMetadata).toHaveBeenCalledWith('@example/plugin', 'npm');
  });

  it('returns an attestation URL when the registry provides package provenance', async () => {
    const service = new NpmPluginService({} as never);
    const internals = service as unknown as ServiceInternals;
    jest.spyOn(internals, 'hostVersion').mockReturnValue('1.9.0');
    jest.spyOn(service, 'packageMetadata').mockResolvedValue({
      'dist-tags': { latest: '1.2.3' },
      versions: {
        '1.2.3': {
          name: '@example/plugin',
          version: '1.2.3',
          keywords: ['attraccess-plugin'],
          peerDependencies: { '@attraccess/plugins-backend-sdk': '*' },
          attraccess: {
            displayName: 'Example Plugin',
            host: '*',
            backend: 'dist/index.js',
            sdk: { backend: '*' },
            permissions: [],
          },
          dist: { attestations: { url: 'https://registry.npmjs.org/-/npm/v1/attestations/@example%2Fplugin@1.2.3' } },
        },
      },
    });

    await expect(service.marketplacePackage('@example/plugin')).resolves.toMatchObject({
      provenance: 'https://registry.npmjs.org/-/npm/v1/attestations/@example%2Fplugin@1.2.3',
    });
  });

  it('discovers plugins through registry keyword search without a hardcoded package list', async () => {
    const service = new NpmPluginService({ getPlainSetting: jest.fn().mockResolvedValue(null) } as never);
    const internals = service as unknown as ServiceInternals;
    jest.spyOn(internals, 'hostVersion').mockReturnValue('1.9.0');
    fixture.lookupAll.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        objects: [
          { package: { name: '@attraccess/plugin-example' } },
          // Registry search can report the same package twice; results are deduplicated.
          { package: { name: '@attraccess/plugin-example' } },
        ],
      },
    });
    const packageMetadata = jest.spyOn(service, 'packageMetadata').mockImplementation(async (name) => ({
      name,
      publisher: { username: 'attraccess' },
      'dist-tags': { latest: '1.2.3' },
      versions: {
        '1.2.3': {
          name,
          version: '1.2.3',
          keywords: ['attraccess-plugin'],
          peerDependencies: { '@attraccess/plugins-backend-sdk': '*' },
          attraccess: {
            displayName: name,
            host: '*',
            backend: 'dist/index.js',
            sdk: { backend: '*' },
            permissions: [],
          },
        },
      },
    }));

    const result = await service.searchMarketplace('example');

    expect(result).toMatchObject({ errors: [] });
    expect(result.results).toEqual([
      expect.objectContaining({ name: '@attraccess/plugin-example', classification: 'official' }),
    ]);
    expect(packageMetadata).not.toHaveBeenCalledWith('@attraccess/plugin-other', 'npm');
  });

  it('retains hydrated marketplace packages when another result no longer has metadata', async () => {
    const service = new NpmPluginService({ getPlainSetting: jest.fn().mockResolvedValue(null) } as never);
    const internals = service as unknown as ServiceInternals;
    jest.spyOn(internals, 'hostVersion').mockReturnValue('1.9.0');
    fixture.lookupAll.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        objects: [{ package: { name: '@example/stale' } }, { package: { name: '@example/plugin' } }],
      },
    });
    jest.spyOn(service, 'packageMetadata').mockImplementation(async (name) => {
      if (name === '@example/stale') throw new Error('Package no longer exists');
      return {
        'dist-tags': { latest: '1.2.3' },
        versions: {
          '1.2.3': {
            name: '@example/plugin',
            version: '1.2.3',
            keywords: ['attraccess-plugin'],
            peerDependencies: { '@attraccess/plugins-backend-sdk': '*' },
            attraccess: {
              displayName: 'Example Plugin',
              host: '*',
              backend: 'dist/index.js',
              sdk: { backend: '*' },
              permissions: [],
            },
          },
        },
      };
    });

    await expect(service.searchMarketplace('example')).resolves.toMatchObject({
      results: [expect.objectContaining({ name: '@example/plugin', installable: true })],
      errors: [],
    });
  });

  it('does not trust a package-declared official flag or a mismatched registry publisher', async () => {
    const service = new NpmPluginService({ getPlainSetting: jest.fn().mockResolvedValue(null) } as never);
    const internals = service as unknown as ServiceInternals;
    jest.spyOn(internals, 'hostVersion').mockReturnValue('1.9.0');
    jest.spyOn(service, 'packageMetadata').mockResolvedValue({
      publisher: { username: 'someone-else' },
      'dist-tags': { latest: '1.2.3' },
      versions: {
        '1.2.3': {
          name: '@attraccess/plugin-example',
          version: '1.2.3',
          keywords: ['attraccess-plugin'],
          peerDependencies: { '@attraccess/plugins-backend-sdk': '*' },
          attraccess: {
            displayName: 'Example',
            host: '*',
            backend: 'dist/index.js',
            sdk: { backend: '*' },
            permissions: [],
            official: true,
          },
        },
      },
    });

    await expect(service.marketplacePackage('@attraccess/plugin-example')).resolves.toMatchObject({
      classification: 'community',
      classificationReason: 'Not published by Attraccess on npm',
    });
  });

  it('rejects marketplace metadata that claims an allowlisted package identity for a different request', async () => {
    const service = new NpmPluginService({ getPlainSetting: jest.fn().mockResolvedValue(null) } as never);
    jest.spyOn(service, 'packageMetadata').mockResolvedValue({
      name: '@example/community-plugin',
      'dist-tags': { latest: '1.2.3' },
      versions: {
        '1.2.3': {
          name: '@attraccess/plugin-example',
          version: '1.2.3',
          keywords: ['attraccess-plugin'],
        },
      },
    });

    await expect(service.marketplacePackage('@example/community-plugin')).rejects.toThrow(
      'Registry metadata identity does not match the requested package',
    );
  });

  it('uses the selected registry for direct marketplace lookup', async () => {
    const settings: SettingsMock = {
      getPlainSetting: jest
        .fn()
        .mockResolvedValue(JSON.stringify([{ id: 'private', name: 'Private', url: 'https://registry.example.com' }])),
      getSecretSetting: jest.fn().mockResolvedValue({ value: null, configured: false }),
      setPlainSetting: jest.fn(),
      setSecretSetting: jest.fn(),
    };
    const service = new NpmPluginService(settings as unknown as never);
    const internals = service as unknown as ServiceInternals;
    jest.spyOn(internals, 'hostVersion').mockReturnValue('1.9.0');
    jest.spyOn(service, 'packageMetadata').mockResolvedValue({
      'dist-tags': { latest: '1.2.3' },
      versions: {
        '1.2.3': {
          name: '@private/plugin',
          version: '1.2.3',
          keywords: ['attraccess-plugin'],
          peerDependencies: { '@attraccess/plugins-backend-sdk': '*' },
          attraccess: {
            displayName: 'Private Plugin',
            host: '*',
            backend: 'dist/index.js',
            sdk: { backend: '*' },
            permissions: [],
          },
        },
      },
    });

    await expect(service.marketplacePackage('@private/plugin', 'private')).resolves.toMatchObject({
      name: '@private/plugin',
      registry: { id: 'private', name: 'Private' },
      installable: true,
    });
    expect(service.packageMetadata).toHaveBeenCalledWith('@private/plugin', 'private');
  });

  it('searches a configured registry when it supports npm search', async () => {
    const settings: SettingsMock = {
      getPlainSetting: jest
        .fn()
        .mockResolvedValue(JSON.stringify([{ id: 'private', name: 'Private', url: 'https://registry.example.com' }])),
      getSecretSetting: jest.fn().mockResolvedValue({ value: null, configured: false }),
      setPlainSetting: jest.fn(),
      setSecretSetting: jest.fn(),
    };
    const service = new NpmPluginService(settings as unknown as never);
    const internals = service as unknown as ServiceInternals;
    jest.spyOn(internals, 'hostVersion').mockReturnValue('1.9.0');
    fixture.lookupAll.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);
    const axiosGet = jest.spyOn(axios, 'get').mockResolvedValue({
      data: { objects: [{ package: { name: '@private/plugin' } }] },
    });
    jest.spyOn(service, 'packageMetadata').mockResolvedValue({
      'dist-tags': { latest: '1.2.3' },
      versions: {
        '1.2.3': {
          name: '@private/plugin',
          version: '1.2.3',
          keywords: ['attraccess-plugin'],
          peerDependencies: { '@attraccess/plugins-backend-sdk': '*' },
          attraccess: {
            displayName: 'Private Plugin',
            host: '*',
            backend: 'dist/index.js',
            sdk: { backend: '*' },
            permissions: [],
          },
        },
      },
    });

    const result = await service.searchMarketplace('private', 'private');

    expect(result.errors).toEqual([]);
    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: '@private/plugin', registry: expect.objectContaining({ id: 'private' }) }),
      ]),
    );
    expect(axiosGet).toHaveBeenCalledWith(
      expect.stringContaining('https://registry.example.com/-/v1/search?text='),
      expect.anything(),
    );
    expect(service.packageMetadata).toHaveBeenCalledWith('@private/plugin', 'private');
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
    fixture.lookupAll.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

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

  it('returns registry metadata without its stored token', async () => {
    const settings: SettingsMock = {
      getPlainSetting: jest
        .fn()
        .mockResolvedValue(JSON.stringify([{ id: 'private', name: 'Private', url: 'https://registry.example.com' }])),
      getSecretSetting: jest.fn().mockResolvedValue({ value: 'secret', configured: true }),
      setPlainSetting: jest.fn(),
      setSecretSetting: jest.fn(),
    };
    const service = new NpmPluginService(settings as unknown as never);

    await expect(service.listRegistries()).resolves.toEqual([
      { id: 'private', name: 'Private', url: 'https://registry.example.com', tokenConfigured: true },
    ]);
  });

  it('rejects registry additions beyond the configured registry limit', async () => {
    const settings: SettingsMock = {
      getPlainSetting: jest.fn().mockResolvedValue(
        JSON.stringify(
          Array.from({ length: MAX_CONFIGURED_REGISTRIES }, (_, index) => ({
            id: `registry-${index}`,
            name: `Registry ${index}`,
            url: `https://registry-${index}.example.com`,
          })),
        ),
      ),
      getSecretSetting: jest.fn(),
      setPlainSetting: jest.fn(),
      setSecretSetting: jest.fn(),
    };
    const service = new NpmPluginService(settings as unknown as never);

    await expect(service.addRegistry({ name: 'Extra', url: 'https://extra.example.com' })).rejects.toThrow(
      `A maximum of ${MAX_CONFIGURED_REGISTRIES} registries can be configured`,
    );
    expect(settings.setPlainSetting).not.toHaveBeenCalled();
    expect(settings.setSecretSetting).not.toHaveBeenCalled();
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
});
