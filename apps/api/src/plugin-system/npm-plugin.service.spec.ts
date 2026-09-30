import { recordNpmBootMigrationOutcome } from './npm-plugin-audit-state';
import { projectAdministrationAuditEvent } from '../audit/audit-administration-policy';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { lookup } from 'dns/promises';
import type { LookupAddress } from 'dns';
const lookupAll = lookup as unknown as jest.MockedFunction<
  (host: string, options: { all: true; verbatim: true }) => Promise<LookupAddress[]>
>;
import { tmpdir } from 'os';
import { join } from 'path';
import * as tar from 'tar';
import axios from 'axios';
import { PluginService } from './plugin.service';
import { MAX_CONFIGURED_REGISTRIES, NpmPluginService, NpmPluginAuditState } from './npm-plugin.service';

function auditState(): NpmPluginAuditState {
  return {
    packageName: '@attraccess/plugin',
    requestedSpec: '1.2.3',
    integrityResult: 'not-checked',
    provenanceResult: 'not-verified',
    migrationOutcome: 'not-run',
    activationOutcome: 'not-attempted',
    restartRequested: 0,
    rollbackOutcome: 'not-needed',
  };
}

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));

type ServiceInternals = {
  download(url: string): Promise<Buffer>;
  hostVersion(): string;
  removeBackup(backup: string): Promise<void>;
  writeState(installed: unknown): Promise<void>;
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

  it.each(['succeeded', 'failed'] as const)(
    'correlates a persisted install with its %s boot result without exposing audit context',
    async (migrationOutcome) => {
      const name = '@attraccess/plugin';
      const tarball = await packageTarball(name, ['READ_USERS']);
      const shasum = createHash('sha1').update(tarball).digest('hex');
      const settings = {
        getPlainSetting: jest.fn(
          async (_parent, key) => ({ enabled: 'true', domains: '["administration"]', retention_days: '90' })[key],
        ),
      };
      const audit = {
        list: jest.fn().mockResolvedValue({ items: [] }),
        recordAdministration: jest.fn().mockResolvedValue({ status: 'recorded' }),
      };
      const service = new NpmPluginService(settings as never, undefined, audit as never);
      const internals = service as unknown as ServiceInternals;
      jest.spyOn(internals, 'hostVersion').mockReturnValue('1.9.0');
      jest.spyOn(service, 'packageMetadata').mockResolvedValue({
        versions: {
          '1.2.3': {
            version: '1.2.3',
            dist: {
              tarball: 'plugin',
              shasum,
            },
          },
        },
      });
      jest.spyOn(internals, 'download').mockResolvedValue(tarball);
      const state = auditState();
      state.context = { operationId: randomUUID(), actorId: 42, authenticationMethod: 'api-token', apiTokenId: 9 };
      await service.install(name, '1.2.3', undefined, state);
      expect(PluginService.prototype.requestRestart).not.toHaveBeenCalled();
      expect(service.listInstalled()[0]).not.toHaveProperty('pendingAudit');
      const persisted = JSON.parse(readFileSync(join(root, '.npm-plugin-state.json'), 'utf8'));
      expect(persisted[0].pendingAudit.operationId).toBe(state.context.operationId);
      expect(state.integrity).toBe(`sha1-${Buffer.from(shasum, 'hex').toString('base64')}`);
      expect(persisted[0].integrity).toBe(`sha1-${Buffer.from(shasum, 'hex').toString('base64')}`);
      await recordNpmBootMigrationOutcome(root, name, '1.2.3', migrationOutcome);
      const manifest = PluginService.getPlugins()[0];
      jest
        .spyOn(PluginService, 'getPluginsWithLoadStatus')
        .mockReturnValue([{ ...manifest, status: migrationOutcome === 'succeeded' ? 'loaded' : 'error' }]);
      jest.spyOn(PluginService, 'isPluginQuarantined').mockReturnValue(migrationOutcome === 'failed');
      const restarted = new NpmPluginService(settings as never, undefined, audit as never);
      await restarted.onApplicationBootstrap();
      const recorded = audit.recordAdministration.mock.calls[0][0];
      expect(projectAdministrationAuditEvent(recorded)).not.toBeNull();
      expect(recorded).toMatchObject({
        operationId: state.context.operationId,
        action: 'plugin.activation_completed',
        actorId: 42,
        authenticationMethod: 'api-token',
        apiTokenId: 9,
        outcome: migrationOutcome,
        details: {
          migrationOutcome,
          activationOutcome: migrationOutcome === 'succeeded' ? 'succeeded' : 'quarantined',
        },
      });
      await restarted.onApplicationBootstrap();
      expect(audit.recordAdministration).toHaveBeenCalledTimes(1);
      expect(JSON.parse(readFileSync(join(root, '.npm-plugin-state.json'), 'utf8'))[0]).not.toHaveProperty(
        'pendingAudit',
      );
    },
  );

  it('pins tarball DNS on every same-origin redirect and returns archive bytes', async () => {
    const service = new NpmPluginService({} as never) as unknown as {
      download: (url: string, registry: { url: string; token: string | null }) => Promise<Buffer>;
    };
    lookupAll.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);
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
    lookupAll.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);
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
    lookupAll.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);

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
    lookupAll.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);
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
    lookupAll.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);
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
    lookupAll.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);
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
    lookupAll.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);
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
    lookupAll.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);
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
    lookupAll.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

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

  it('installs standard package-prefixed tarballs without losing concurrent state updates', async () => {
    const service = new NpmPluginService({ getPlainSetting: jest.fn().mockResolvedValue(null) } as never);
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

  it('persists an exact private-registry installation across service restart', async () => {
    const name = '@private/plugin';
    const tarball = await packageTarball(name);
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
      versions: {
        '1.2.3': {
          version: '1.2.3',
          dist: { tarball: 'plugin', shasum: createHash('sha1').update(tarball).digest('hex') },
        },
      },
    });
    jest.spyOn(internals, 'download').mockResolvedValue(tarball);

    await service.install(name, '1.2.3', 'private');

    expect(new NpmPluginService(settings as unknown as never).listInstalled()).toEqual([
      expect.objectContaining({ name, version: '1.2.3', registryId: 'private' }),
    ]);
  });

  it('classifies an installation using the selected version publisher', async () => {
    const name = '@attraccess/plugin-example';
    const tarball = await packageTarball(name);
    const service = new NpmPluginService({} as never);
    const internals = service as unknown as ServiceInternals;

    jest.spyOn(internals, 'hostVersion').mockReturnValue('1.9.0');
    jest.spyOn(service, 'packageMetadata').mockResolvedValue({
      maintainers: [{ name: 'attraccess' }],
      versions: {
        '1.2.3': {
          version: '1.2.3',
          _npmUser: { name: 'someone-else' },
          dist: { tarball: 'plugin', shasum: createHash('sha1').update(tarball).digest('hex') },
        },
      },
    });
    jest.spyOn(internals, 'download').mockResolvedValue(tarball);

    await expect(service.install(name, '1.2.3')).resolves.toMatchObject({
      classification: 'community',
      publisher: 'someone-else',
    });
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

  it('restarts after removing a package when quarantine cleanup fails', async () => {
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
    jest.spyOn(PluginService, 'clearPluginQuarantine').mockImplementation(() => {
      throw new Error('quarantine write failed');
    });
    const service = new NpmPluginService({} as never);

    await expect(service.removeInstalled(name)).resolves.toBeUndefined();

    expect(existsSync(join(root, installPath))).toBe(false);
    expect(service.listInstalled()).toEqual([]);
    expect(PluginService.prototype.requestRestart).toHaveBeenCalled();
  });

  it('keeps a removed npm plugin quarantined when state persistence fails', async () => {
    const name = '@attraccess/plugin';
    const installPath = `npm-${Buffer.from(name).toString('base64url')}`;
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
    mkdirSync(join(root, installPath), { recursive: true });
    writeFileSync(
      join(root, installPath, 'plugin.json'),
      JSON.stringify({
        name,
        version: '1.2.3',
        main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
        attraccessVersion: { min: '1.0.0' },
      }),
    );
    const [plugin] = PluginService.getPlugins();
    PluginService.quarantinePlugin(plugin, new Error('prior crash'));
    const service = new NpmPluginService({} as never);
    jest
      .spyOn(service as unknown as { writeStateWithout(name: string): Promise<void> }, 'writeStateWithout')
      .mockRejectedValue(new Error('state write failed'));

    await expect(service.removeInstalled(name)).rejects.toThrow('state write failed');

    expect(PluginService.isPluginQuarantined(plugin)).toBe(true);
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

  it('returns a quarantined install when quarantine cleanup fails', async () => {
    const name = '@attraccess/plugin';
    const audit = auditState();
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
    jest.spyOn(PluginService, 'clearPluginQuarantine').mockImplementation(() => {
      throw new Error('quarantine write failed');
    });

    await expect(service.install(name, '1.2.3', undefined, audit)).resolves.toMatchObject({
      name,
      version: '1.2.3',
      state: 'quarantined',
      lastError: expect.stringContaining('quarantine cleanup failed'),
    });

    expect(audit).toMatchObject({
      integrityResult: 'verified',
      activationOutcome: 'quarantined',
      migrationOutcome: 'not-run',
      restartRequested: 1,
    });
    expect(service.listInstalled()).toEqual([
      expect.objectContaining({
        state: 'quarantined',
        lastError: expect.stringContaining('quarantine cleanup failed'),
      }),
    ]);
    expect(existsSync(join(root, `npm-${Buffer.from(name).toString('base64url')}`))).toBe(true);
    expect(PluginService.prototype.requestRestart).toHaveBeenCalled();
  });

  it('keeps a plugin quarantined when its final active state cannot be persisted', async () => {
    const name = '@attraccess/plugin';
    const installPath = `npm-${Buffer.from(name).toString('base64url')}`;
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
    const writeState = internals.writeState.bind(service);
    jest
      .spyOn(internals, 'writeState')
      .mockImplementationOnce(writeState)
      .mockRejectedValueOnce(new Error('final state write failed'));

    await expect(service.install(name, '1.2.3')).rejects.toThrow('final state write failed');

    expect(PluginService.isPluginQuarantined({ pluginDirectory: installPath })).toBe(true);
    PluginService.configure({ PLUGIN_DIR: root, RESTART_BY_EXIT: true });
    expect(PluginService.isPluginQuarantined({ pluginDirectory: installPath })).toBe(true);
  });

  it('rolls back an activation when its quarantine fallback cannot be persisted', async () => {
    const name = '@attraccess/plugin';
    const audit = auditState();
    const installPath = `npm-${Buffer.from(name).toString('base64url')}`;
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
    const writeState = internals.writeState.bind(service);
    jest
      .spyOn(internals, 'writeState')
      .mockImplementationOnce(writeState)
      .mockRejectedValueOnce(new Error('final state write failed'));
    jest.spyOn(PluginService, 'quarantinePluginDirectory').mockImplementation(() => {
      throw new Error('quarantine write failed');
    });

    await expect(service.install(name, '1.2.3', undefined, audit)).rejects.toThrow('final state write failed');

    expect(existsSync(join(root, installPath))).toBe(false);
    expect(audit).toMatchObject({
      integrityResult: 'verified',
      activationOutcome: 'failed',
      rollbackOutcome: 'succeeded',
      restartRequested: 0,
    });
    expect(service.listInstalled()).toEqual([]);
  });

  it('retries rollback after isolating a failed activation', async () => {
    const name = '@attraccess/plugin';
    const installPath = `npm-${Buffer.from(name).toString('base64url')}`;
    const tarball = await packageTarball(name);
    const service = new NpmPluginService({} as never);
    const internals = service as unknown as ServiceInternals & {
      rollbackActivation(activation: { target: string; backup: string }): Promise<void>;
    };

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
    jest
      .spyOn(internals, 'writeState')
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error('final state write failed'));
    jest.spyOn(PluginService, 'quarantinePluginDirectory').mockImplementation(() => {
      throw new Error('quarantine write failed');
    });
    const rollbackActivation = internals.rollbackActivation.bind(service);
    const rollback = jest
      .spyOn(internals, 'rollbackActivation')
      .mockRejectedValueOnce(new Error('rollback failed'))
      .mockImplementation(rollbackActivation);

    await expect(service.install(name, '1.2.3')).rejects.toThrow('final state write failed');

    expect(rollback).toHaveBeenCalledTimes(2);
    expect(existsSync(join(root, installPath))).toBe(false);
    expect(readdirSync(join(root, '.npm-backups')).some((entry) => entry.startsWith('failed-'))).toBe(true);
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

  it('fails recovery when it cannot reconcile a package backup', async () => {
    writeFileSync(join(root, '.npm-backups'), 'not a directory');

    await expect(NpmPluginService.recoverBackups()).rejects.toThrow();
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

  it('classifies each version using its own publisher metadata', async () => {
    const service = new NpmPluginService({} as never);
    writeFileSync(
      join(root, '.npm-plugin-state.json'),
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

  it('records an available patch update without changing the requested range', async () => {
    const name = '@attraccess/plugin';
    writeFileSync(
      join(root, '.npm-plugin-state.json'),
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
      join(root, '.npm-plugin-state.json'),
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
      join(root, '.npm-plugin-state.json'),
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
      join(root, '.npm-plugin-state.json'),
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
      join(root, '.npm-plugin-state.json'),
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
      join(root, '.npm-plugin-state.json'),
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
      join(root, '.npm-plugin-state.json'),
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
      join(root, '.npm-plugin-state.json'),
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
      join(root, '.npm-plugin-state.json'),
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
