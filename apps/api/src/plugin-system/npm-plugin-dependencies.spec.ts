import { createHash } from 'crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { rename } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import * as tar from 'tar';
import { PluginService } from './plugin.service';
import { NpmPluginService } from './npm-plugin.service';
import { PluginDependency } from './plugin-dependencies';

function pkg(name: string, dependencies: PluginDependency[] = [], version = '1.0.0') {
  return {
    name,
    version,
    keywords: ['attraccess-plugin'],
    peerDependencies: { '@attraccess/plugins-backend-sdk': '*' },
    attraccess: {
      displayName: name === 'core' ? '3D Printer Core' : name,
      host: '*',
      backend: 'dist/index.js',
      sdk: { backend: '*' },
      permissions: ['READ_USERS'],
      dependencies,
    },
  };
}
const dep = (name: string, version = '^1.0.0') => ({ name, version, required: true });
type Internals = {
  hostVersion(): string;
  download(url: string): Promise<Buffer>;
  writeRecords(records: unknown[]): Promise<void>;
};

async function archive(value: ReturnType<typeof pkg>) {
  const root = mkdtempSync(join(tmpdir(), 'plugin-graph-package-'));
  try {
    mkdirSync(join(root, 'package', 'dist'), { recursive: true });
    writeFileSync(join(root, 'package', 'package.json'), JSON.stringify(value));
    writeFileSync(join(root, 'package', 'dist', 'index.js'), 'module.exports = {};');
    const chunks: Buffer[] = [];
    for await (const chunk of tar.c({ cwd: root, gzip: true }, ['package'])) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('npm plugin dependency lifecycle', () => {
  let root: string;
  let service: NpmPluginService;
  let internals: Internals;
  let metadata: Record<string, { versions: Record<string, unknown> }>;
  let archives: Map<string, Buffer>;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'plugin-graph-'));
    PluginService.configure({ PLUGIN_DIR: root, RESTART_BY_EXIT: true });
    jest.spyOn(PluginService.prototype, 'requestRestart').mockImplementation(() => undefined);
    service = new NpmPluginService({ getPlainSetting: jest.fn().mockResolvedValue(null) } as never);
    internals = service as unknown as Internals;
    jest.spyOn(internals, 'hostVersion').mockReturnValue('1.9.0');
    metadata = {};
    archives = new Map();
    jest.spyOn(service, 'packageMetadata').mockImplementation(async (name) => metadata[name] ?? { versions: {} });
    jest.spyOn(internals, 'download').mockImplementation(async (url) => {
      if (!archives.has(url)) throw new Error('download failed');
      return archives.get(url);
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });
  const publish = async (value: ReturnType<typeof pkg>) => {
    const buffer = await archive(value);
    const url = `${value.name}/${value.version}`;
    archives.set(url, buffer);
    metadata[value.name] ??= { versions: {} };
    metadata[value.name].versions[value.version] = {
      ...value,
      dist: { tarball: url, integrity: `sha512-${createHash('sha512').update(buffer).digest('base64')}` },
    };
  };
  const install = async (name: string) => {
    const plan = await service.installPlan(name, '1.0.0');
    return service.install(name, '1.0.0', undefined, undefined, plan.token);
  };
  it('previews direct and transitive dependencies and commits them with a single confirmation and restart', async () => {
    await publish(pkg('core'));
    await publish(pkg('adapter', [dep('core')]));
    await publish(pkg('provider', [dep('adapter')]));
    const plan = await service.installPlan('provider', '1.0.0');
    expect(plan.plugins.map(({ name, action }) => [name, action])).toEqual([
      ['core', 'install'],
      ['adapter', 'install'],
      ['provider', 'install'],
    ]);
    expect(plan.plugins[0].permissions).toEqual(['READ_USERS']);
    await expect(service.install('provider', '1.0.0')).rejects.toThrow('requires confirmation');
    expect(internals.download).not.toHaveBeenCalled();
    await service.install('provider', '1.0.0', undefined, undefined, plan.token);
    expect(service.listInstalled().map(({ name }) => name)).toEqual(['core', 'adapter', 'provider']);
    expect(PluginService.prototype.requestRestart).toHaveBeenCalledTimes(1);
    expect(PluginService.getPlugins().find(({ name }) => name === 'provider').dependencies).toEqual([dep('adapter')]);
    expect(existsSync(join(root, '.npm-plugin-transaction.json'))).toBe(false);
  });
  it('reuses a compatible dependency without downloading or replacing it', async () => {
    await publish(pkg('core'));
    await publish(pkg('provider', [dep('core')]));
    await install('core');
    const existing = service.listInstalled()[0];
    const plan = await service.installPlan('provider', '1.0.0');
    expect(plan.plugins[0].action).toBe('reuse');
    (internals.download as jest.Mock).mockClear();
    await service.install('provider', '1.0.0', undefined, undefined, plan.token);
    expect(internals.download).toHaveBeenCalledTimes(1);
    expect(service.listInstalled().find(({ name }) => name === 'core')).toEqual(existing);
  });
  it('resolves and confirms the complete dependency tree from distribution-only registry metadata', async () => {
    await publish(pkg('core'));
    await publish(pkg('adapter', [dep('core')]));
    await publish(pkg('provider', [dep('adapter')]));
    for (const entry of Object.values(metadata)) {
      for (const version of Object.values(entry.versions)) delete (version as { attraccess?: unknown }).attraccess;
    }

    const plan = await service.installPlan('provider', '1.0.0');
    expect(plan.plugins.map(({ name, action, permissions }) => ({ name, action, permissions }))).toEqual([
      { name: 'core', action: 'install', permissions: ['READ_USERS'] },
      { name: 'adapter', action: 'install', permissions: ['READ_USERS'] },
      { name: 'provider', action: 'install', permissions: ['READ_USERS'] },
    ]);
    expect(service.listInstalled()).toEqual([]);
    expect(readdirSync(root)).toEqual([]);
    await expect(service.install('provider', '1.0.0')).rejects.toThrow('requires confirmation');
    expect(service.listInstalled()).toEqual([]);
    await service.install('provider', '1.0.0', undefined, undefined, plan.token);
    expect(service.listInstalled().map(({ name }) => name)).toEqual(['core', 'adapter', 'provider']);
    expect(PluginService.prototype.requestRestart).toHaveBeenCalledTimes(1);
    expect(readdirSync(root).some((name) => name.startsWith('.npm-staging-'))).toBe(false);
  });
  it('uses the registry package publisher consistently during planning and installation', async () => {
    const core = '@attraccess/plugin-core';
    const provider = '@attraccess/plugin-provider';
    await publish(pkg(core));
    await publish(pkg(provider, [dep(core)]));
    for (const entry of Object.values(metadata)) Object.assign(entry, { _npmUser: { name: 'attraccess' } });

    const plan = await service.installPlan(provider, '1.0.0');
    expect(plan.plugins.map(({ classification }) => classification)).toEqual(['official', 'official']);
    await service.install(provider, '1.0.0', undefined, undefined, plan.token);
    expect(service.listInstalled().map(({ classification }) => classification)).toEqual(['official', 'official']);
  });
  it('rejects a stale approval when registry permissions change', async () => {
    await publish(pkg('core'));
    await publish(pkg('provider', [dep('core')]));
    const plan = await service.installPlan('provider', '1.0.0');
    const changed = pkg('core');
    changed.attraccess.permissions = [];
    await publish(changed);
    await expect(service.install('provider', '1.0.0', undefined, undefined, plan.token)).rejects.toThrow(
      'plan changed',
    );
    expect(service.listInstalled()).toEqual([]);
    expect(internals.download).not.toHaveBeenCalled();
  });
  it('rejects registry and tarball dependency mismatches without installing anything', async () => {
    await publish(pkg('core'));
    await publish(pkg('provider', [dep('core')]));
    // Integrity is valid, but the tarball differs from the reviewed manifest.
    const value = pkg('provider', [dep('core', '^2')]);
    const buffer = await archive(value);
    archives.set('provider/1.0.0', buffer);
    (metadata.provider.versions['1.0.0'] as { dist: { integrity: string } }).dist.integrity =
      `sha512-${createHash('sha512').update(buffer).digest('base64')}`;
    const plan = await service.installPlan('provider', '1.0.0');
    await expect(service.install('provider', '1.0.0', undefined, undefined, plan.token)).rejects.toThrow(
      'does not match',
    );
    expect(service.listInstalled()).toEqual([]);
    expect(PluginService.getPlugins()).toEqual([]);
  });
  it.each(['download', 'state'])('rolls back the complete tree when %s fails', async (failure) => {
    await publish(pkg('core'));
    await publish(pkg('provider', [dep('core')]));
    const plan = await service.installPlan('provider', '1.0.0');
    if (failure === 'download') archives.delete('provider/1.0.0');
    else jest.spyOn(internals, 'writeRecords').mockRejectedValue(new Error('state failed'));
    await expect(service.install('provider', '1.0.0', undefined, undefined, plan.token)).rejects.toThrow('failed');
    expect(service.listInstalled()).toEqual([]);
    expect(PluginService.getPlugins()).toEqual([]);
    expect(PluginService.prototype.requestRestart).not.toHaveBeenCalled();
  });
  it('blocks incompatible upgrades and downgrades of dependencies and dependants', async () => {
    await publish(pkg('core'));
    await publish(pkg('provider', [dep('core')]));
    await install('provider');
    await publish(pkg('core', [], '2.0.0'));
    await publish(pkg('core', [], '0.9.0'));
    await publish(pkg('provider', [dep('core', '^2')], '1.1.0'));
    for (const version of ['2.0.0', '0.9.0']) {
      const candidate = (await service.installedVersionCandidates('core')).find((item) => item.version === version);
      expect(candidate.compatible).toBe(false);
      await expect(service.replaceInstalled('core', version, [], true)).rejects.toThrow('requires core');
    }
    await expect(service.replaceInstalled('provider', '1.1.0')).rejects.toThrow('requires core');
    expect(service.listInstalled().map(({ version }) => version)).toEqual(['1.0.0', '1.0.0']);
  });
  it('installs newly required plugins during a confirmed update, retaining existing dependencies', async () => {
    await publish(pkg('core'));
    await publish(pkg('provider', [dep('core')]));
    await install('provider');
    await publish(pkg('new-core'));
    await publish(pkg('provider', [dep('new-core')], '1.1.0'));
    const candidate = (await service.installedVersionCandidates('provider')).find(
      (candidate) => candidate.version === '1.1.0',
    );
    expect(candidate.compatible).toBe(true);
    const plan = await service.installPlan('provider', '1.1.0');
    await expect(service.replaceInstalled('provider', '1.1.0')).rejects.toThrow('requires confirmation');
    await service.replaceInstalled('provider', '1.1.0', [], false, undefined, plan.token);
    expect(service.listInstalled().map(({ name, version }) => [name, version])).toEqual([
      ['core', '1.0.0'],
      ['new-core', '1.0.0'],
      ['provider', '1.1.0'],
    ]);
  });

  it('protects dependencies and requires the exact transitive removal approval', async () => {
    await publish(pkg('core'));
    await publish(pkg('adapter', [dep('core')]));
    await publish(pkg('provider', [dep('adapter')]));
    await install('provider');
    await expect(service.removeInstalled('core')).rejects.toThrow('adapter, provider');
    await expect(service.removeInstalled('core', false, ['adapter'])).rejects.toThrow('required by');
    expect(service.listInstalled()).toHaveLength(3);
    await service.removeInstalled('core', false, ['adapter', 'provider']);
    expect(service.listInstalled()).toEqual([]);
    expect(PluginService.getPlugins()).toEqual([]);
  });
  it('restores all files and state when grouped removal fails to persist', async () => {
    await publish(pkg('core'));
    await publish(pkg('provider', [dep('core')]));
    await install('provider');
    const before = service.listInstalled();
    jest.spyOn(internals, 'writeRecords').mockRejectedValue(new Error('state failed'));
    await expect(service.removeInstalled('core', false, ['provider'])).rejects.toThrow('state failed');
    expect(service.listInstalled()).toEqual(before);
    expect(PluginService.getPlugins()).toHaveLength(2);
  });
  it('blocks subsequent state changes until a committed transaction journal is recovered', async () => {
    await publish(pkg('core'));
    await publish(pkg('provider', [dep('core')]));
    await publish(pkg('independent'));
    await install('provider');
    const before = service.listInstalled();
    writeFileSync(
      join(root, '.npm-plugin-transaction.json'),
      JSON.stringify({ after: readFileSync(join(root, '.npm-plugin-state.json'), 'utf8'), moves: [] }),
    );

    await expect(service.updateRequestedSpec('provider', '^1')).rejects.toThrow('restarting first');
    await expect(install('independent')).rejects.toThrow('restarting first');
    await expect(service.removeInstalled('core', false, ['provider'])).rejects.toThrow('restarting first');
    expect(service.listInstalled()).toEqual(before);
    expect(PluginService.getPlugins()).toHaveLength(2);

    await NpmPluginService.recoverBackups();
    await install('independent');
    expect(service.listInstalled()).toHaveLength(3);
  });
  it.each([false, true])('recovers a grouped file transaction after a crash (committed=%s)', async (committed) => {
    await publish(pkg('core'));
    await publish(pkg('provider', [dep('core')]));
    await install('provider');
    const installed = service.listInstalled();
    const moves = installed.map((plugin, index) => ({
      installPath: plugin.installPath,
      backupName: `${plugin.installPath}-00000000-0000-0000-0000-${String(index).padStart(12, '0')}`,
      hadTarget: true,
    }));
    mkdirSync(join(root, '.npm-backups'), { recursive: true });
    for (const move of moves) await rename(join(root, move.installPath), join(root, '.npm-backups', move.backupName));
    writeFileSync(join(root, '.npm-plugin-transaction.json'), JSON.stringify({ after: '[]', moves }));
    if (committed) writeFileSync(join(root, '.npm-plugin-state.json'), '[]');
    await NpmPluginService.recoverBackups();
    expect(PluginService.getPlugins()).toHaveLength(committed ? 0 : 2);
    expect(service.listInstalled()).toHaveLength(committed ? 0 : 2);
    expect(existsSync(join(root, '.npm-plugin-transaction.json'))).toBe(false);
  });
});
