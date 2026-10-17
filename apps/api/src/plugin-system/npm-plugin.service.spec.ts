import { createHash, randomUUID } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { projectAdministrationAuditEvent } from '../audit/policies/administration';
import { recordNpmBootMigrationOutcome } from './npm/audit-state';
import { NpmPluginService } from './npm-plugin.service';
import type { ServiceInternals, SettingsMock } from './npm-plugin.test-fixture';
import { setupNpmPluginFixture } from './npm-plugin.test-fixture';
import { PluginService } from './plugin.service';
jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
describe('NpmPluginService', () => {
  const fixture = setupNpmPluginFixture();
  it.each(['succeeded', 'failed'] as const)(
    'correlates a persisted install with its %s boot result without exposing audit context',
    async (migrationOutcome) => {
      const name = '@attraccess/plugin';
      const tarball = await fixture.packageTarball(name, ['READ_USERS']);
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
      const state = fixture.auditState();
      state.context = { operationId: randomUUID(), actorId: 42, authenticationMethod: 'api-token', apiTokenId: 9 };
      await service.install(name, '1.2.3', undefined, state);
      expect(PluginService.prototype.requestRestart).not.toHaveBeenCalled();
      expect(service.listInstalled()[0]).not.toHaveProperty('pendingAudit');
      const persisted = JSON.parse(readFileSync(join(fixture.root, '.npm-plugin-state.json'), 'utf8'));
      expect(persisted[0].pendingAudit.operationId).toBe(state.context.operationId);
      expect(state.integrity).toBe(`sha1-${Buffer.from(shasum, 'hex').toString('base64')}`);
      expect(persisted[0].integrity).toBe(`sha1-${Buffer.from(shasum, 'hex').toString('base64')}`);
      await recordNpmBootMigrationOutcome(fixture.root, name, '1.2.3', migrationOutcome);
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
      expect(JSON.parse(readFileSync(join(fixture.root, '.npm-plugin-state.json'), 'utf8'))[0]).not.toHaveProperty(
        'pendingAudit',
      );
    },
  );

  it('installs standard package-prefixed tarballs without losing concurrent state updates', async () => {
    const service = new NpmPluginService({ getPlainSetting: jest.fn().mockResolvedValue(null) } as never);
    const internals = service as unknown as ServiceInternals;
    const packages = await Promise.all(
      ['@attraccess/one', '@attraccess/two'].map(async (name) => [name, await fixture.packageTarball(name)] as const),
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
    expect(existsSync(join(fixture.root, 'npm-QGF0dHJhY2Nlc3Mvb25l', 'dist', 'index.js'))).toBe(true);
  });

  it('persists an exact private-registry installation across service restart', async () => {
    const name = '@private/plugin';
    const tarball = await fixture.packageTarball(name);
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
    const tarball = await fixture.packageTarball(name);
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
    const tarball = await fixture.packageTarball(name);
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
    const tarball = await fixture.packageTarball(name);
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
    mkdirSync(join(fixture.root, installPath), { recursive: true });
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
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

    expect(existsSync(join(fixture.root, installPath))).toBe(false);
    expect(service.listInstalled()).toEqual([]);
    expect(PluginService.prototype.requestRestart).toHaveBeenCalled();
  });

  it('restarts after removing a package when quarantine cleanup fails', async () => {
    const name = '@attraccess/plugin';
    const installPath = `npm-${Buffer.from(name).toString('base64url')}`;
    mkdirSync(join(fixture.root, installPath), { recursive: true });
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
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

    expect(existsSync(join(fixture.root, installPath))).toBe(false);
    expect(service.listInstalled()).toEqual([]);
    expect(PluginService.prototype.requestRestart).toHaveBeenCalled();
  });

  it('keeps a removed npm plugin quarantined when state persistence fails', async () => {
    const name = '@attraccess/plugin';
    const installPath = `npm-${Buffer.from(name).toString('base64url')}`;
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
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
    mkdirSync(join(fixture.root, installPath), { recursive: true });
    writeFileSync(
      join(fixture.root, installPath, 'plugin.json'),
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
    const tarball = await fixture.packageTarball(name);
    const target = join(fixture.root, `npm-${Buffer.from(name).toString('base64url')}`);
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
    expect(readdirSync(join(fixture.root, '.npm-backups'))).toHaveLength(1);

    await service.onModuleInit();

    expect(existsSync(join(fixture.root, '.npm-backups'))).toBe(false);
  });

  it('returns a quarantined install when quarantine cleanup fails', async () => {
    const name = '@attraccess/plugin';
    const audit = fixture.auditState();
    const tarball = await fixture.packageTarball(name);
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
    expect(existsSync(join(fixture.root, `npm-${Buffer.from(name).toString('base64url')}`))).toBe(true);
    expect(PluginService.prototype.requestRestart).toHaveBeenCalled();
  });

  it('keeps a plugin quarantined when its final active state cannot be persisted', async () => {
    const name = '@attraccess/plugin';
    const installPath = `npm-${Buffer.from(name).toString('base64url')}`;
    const tarball = await fixture.packageTarball(name);
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
    PluginService.configure({ PLUGIN_DIR: fixture.root, RESTART_BY_EXIT: true });
    expect(PluginService.isPluginQuarantined({ pluginDirectory: installPath })).toBe(true);
  });

  it('rolls back an activation when its quarantine fallback cannot be persisted', async () => {
    const name = '@attraccess/plugin';
    const audit = fixture.auditState();
    const installPath = `npm-${Buffer.from(name).toString('base64url')}`;
    const tarball = await fixture.packageTarball(name);
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

    expect(existsSync(join(fixture.root, installPath))).toBe(false);
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
    const tarball = await fixture.packageTarball(name);
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
    expect(existsSync(join(fixture.root, installPath))).toBe(false);
    expect(readdirSync(join(fixture.root, '.npm-backups')).some((entry) => entry.startsWith('failed-'))).toBe(true);
  });

  it('restores the state-matching package after an interrupted replacement', async () => {
    const name = '@attraccess/plugin';
    const installPath = `npm-${Buffer.from(name).toString('base64url')}`;
    const backup = join(fixture.root, '.npm-backups', `${installPath}-00000000-0000-0000-0000-000000000000`);
    mkdirSync(join(backup, 'dist'), { recursive: true });
    writeFileSync(join(backup, 'plugin.json'), JSON.stringify({ name, version: '1.0.0' }));
    writeFileSync(join(backup, 'dist', 'index.js'), 'module.exports = {};');
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
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

    expect(existsSync(join(fixture.root, installPath, 'dist', 'index.js'))).toBe(true);
    expect(existsSync(backup)).toBe(false);
  });

  it('replaces newly activated code with the state-matching backup after a crash', async () => {
    const name = '@attraccess/plugin';
    const installPath = `npm-${Buffer.from(name).toString('base64url')}`;
    const backup = join(fixture.root, '.npm-backups', `${installPath}-00000000-0000-0000-0000-000000000000`);
    mkdirSync(join(backup, 'dist'), { recursive: true });
    writeFileSync(join(backup, 'plugin.json'), JSON.stringify({ name, version: '1.0.0' }));
    writeFileSync(join(backup, 'dist', 'index.js'), 'module.exports = "1.0.0";');
    mkdirSync(join(fixture.root, installPath, 'dist'), { recursive: true });
    writeFileSync(join(fixture.root, installPath, 'plugin.json'), JSON.stringify({ name, version: '2.0.0' }));
    writeFileSync(join(fixture.root, installPath, 'dist', 'index.js'), 'module.exports = "2.0.0";');
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
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

    expect(readFileSync(join(fixture.root, installPath, 'dist', 'index.js'), 'utf8')).toBe('module.exports = "1.0.0";');
    expect(existsSync(backup)).toBe(false);
  });

  it('skips backup recovery when plugins are not configured', async () => {
    PluginService.configure({ PLUGIN_DIR: '', RESTART_BY_EXIT: true });

    await expect(NpmPluginService.recoverBackups()).resolves.toBeUndefined();
  });

  it('fails recovery when it cannot reconcile a package backup', async () => {
    writeFileSync(join(fixture.root, '.npm-backups'), 'not a directory');

    await expect(NpmPluginService.recoverBackups()).rejects.toThrow();
  });
});
