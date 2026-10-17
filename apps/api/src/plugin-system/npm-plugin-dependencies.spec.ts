import { registerNpmPluginDependencyLifecycleFixture } from './npm-plugin-dependencies.npm-plugin-dependency-lifecycle.test-fixture';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { PluginService } from './plugin.service';
import { NpmPluginService } from './npm-plugin.service';
import { rename } from 'fs/promises';
import { createHash } from 'crypto';

describe('npm plugin dependency lifecycle', () => {
  const fixture = registerNpmPluginDependencyLifecycleFixture();

  it('previews direct and transitive dependencies and commits them with a single confirmation and restart', async () => {
    await fixture.publish(fixture.pkg('core'));
    await fixture.publish(fixture.pkg('adapter', [fixture.dep('core')]));
    await fixture.publish(fixture.pkg('provider', [fixture.dep('adapter')]));
    const plan = await fixture.service.installPlan('provider', '1.0.0');
    expect(plan.plugins.map(({ name, action }) => [name, action])).toEqual([
      ['core', 'install'],
      ['adapter', 'install'],
      ['provider', 'install'],
    ]);
    expect(plan.plugins[0].permissions).toEqual(['READ_USERS']);
    await expect(fixture.service.install('provider', '1.0.0')).rejects.toThrow('requires confirmation');
    expect(fixture.internals.download).not.toHaveBeenCalled();
    await fixture.service.install('provider', '1.0.0', undefined, undefined, plan.token);
    expect(fixture.service.listInstalled().map(({ name }) => name)).toEqual(['core', 'adapter', 'provider']);
    expect(PluginService.prototype.requestRestart).toHaveBeenCalledTimes(1);
    expect(PluginService.getPlugins().find(({ name }) => name === 'provider').dependencies).toEqual([
      fixture.dep('adapter'),
    ]);
    expect(existsSync(join(fixture.root, '.npm-plugin-transaction.json'))).toBe(false);
  });

  it('reuses a compatible dependency without downloading or replacing it', async () => {
    await fixture.publish(fixture.pkg('core'));
    await fixture.publish(fixture.pkg('provider', [fixture.dep('core')]));
    await fixture.install('core');
    const existing = fixture.service.listInstalled()[0];
    const plan = await fixture.service.installPlan('provider', '1.0.0');
    expect(plan.plugins[0].action).toBe('reuse');
    (fixture.internals.download as jest.Mock).mockClear();
    await fixture.service.install('provider', '1.0.0', undefined, undefined, plan.token);
    expect(fixture.internals.download).toHaveBeenCalledTimes(1);
    expect(fixture.service.listInstalled().find(({ name }) => name === 'core')).toEqual(existing);
  });

  it('resolves and confirms the complete dependency tree from distribution-only registry metadata', async () => {
    await fixture.publish(fixture.pkg('core'));
    await fixture.publish(fixture.pkg('adapter', [fixture.dep('core')]));
    await fixture.publish(fixture.pkg('provider', [fixture.dep('adapter')]));
    for (const entry of Object.values(fixture.metadata)) {
      for (const version of Object.values(entry.versions)) delete (version as { attraccess?: unknown }).attraccess;
    }

    const plan = await fixture.service.installPlan('provider', '1.0.0');
    expect(plan.plugins.map(({ name, action, permissions }) => ({ name, action, permissions }))).toEqual([
      { name: 'core', action: 'install', permissions: ['READ_USERS'] },
      { name: 'adapter', action: 'install', permissions: ['READ_USERS'] },
      { name: 'provider', action: 'install', permissions: ['READ_USERS'] },
    ]);
    expect(fixture.service.listInstalled()).toEqual([]);
    expect(readdirSync(fixture.root)).toEqual([]);
    await expect(fixture.service.install('provider', '1.0.0')).rejects.toThrow('requires confirmation');
    expect(fixture.service.listInstalled()).toEqual([]);
    await fixture.service.install('provider', '1.0.0', undefined, undefined, plan.token);
    expect(fixture.service.listInstalled().map(({ name }) => name)).toEqual(['core', 'adapter', 'provider']);
    expect(PluginService.prototype.requestRestart).toHaveBeenCalledTimes(1);
    expect(readdirSync(fixture.root).some((name) => name.startsWith('.npm-staging-'))).toBe(false);
  });

  it('uses the registry package publisher consistently during planning and installation', async () => {
    const core = '@attraccess/plugin-core';
    const provider = '@attraccess/plugin-provider';
    await fixture.publish(fixture.pkg(core));
    await fixture.publish(fixture.pkg(provider, [fixture.dep(core)]));
    for (const entry of Object.values(fixture.metadata)) Object.assign(entry, { _npmUser: { name: 'attraccess' } });

    const plan = await fixture.service.installPlan(provider, '1.0.0');
    expect(plan.plugins.map(({ classification }) => classification)).toEqual(['official', 'official']);
    await fixture.service.install(provider, '1.0.0', undefined, undefined, plan.token);
    expect(fixture.service.listInstalled().map(({ classification }) => classification)).toEqual([
      'official',
      'official',
    ]);
  });

  it('inspects only the first matching tarball release needed for a dependency plan', async () => {
    for (const version of ['0.9.0', '1.0.0', '1.1.0', '2.0.0']) await fixture.publish(fixture.pkg('core', [], version));
    await fixture.publish(fixture.pkg('provider', [fixture.dep('core')]));
    for (const version of Object.values(fixture.metadata.core.versions))
      delete (version as { attraccess?: unknown }).attraccess;

    const plan = await fixture.service.installPlan('provider', '1.0.0');
    expect(plan.plugins.map(({ name, version }) => [name, version])).toEqual([
      ['core', '1.1.0'],
      ['provider', '1.0.0'],
    ]);
    expect((fixture.internals.download as jest.Mock).mock.calls.map(([url]) => url)).toEqual(['core/1.1.0']);
  });

  it('inspects alternative tarball releases lazily when backtracking changes dependency ranges', async () => {
    await fixture.publish(fixture.pkg('core'));
    await fixture.publish(fixture.pkg('core', [], '2.0.0'));
    await fixture.publish(fixture.pkg('adapter', [fixture.dep('core')]));
    await fixture.publish(fixture.pkg('adapter', [fixture.dep('core', '^2'), fixture.dep('missing')], '1.1.0'));
    await fixture.publish(fixture.pkg('provider', [fixture.dep('adapter')]));
    for (const version of Object.values(fixture.metadata.core.versions))
      delete (version as { attraccess?: unknown }).attraccess;

    const plan = await fixture.service.installPlan('provider', '1.0.0');
    expect(plan.plugins.map(({ name, version }) => [name, version])).toEqual([
      ['core', '1.0.0'],
      ['adapter', '1.0.0'],
      ['provider', '1.0.0'],
    ]);
    expect((fixture.internals.download as jest.Mock).mock.calls.map(([url]) => url)).toEqual([
      'core/2.0.0',
      'core/1.0.0',
    ]);
  });

  it('rejects a stale approval when registry permissions change', async () => {
    await fixture.publish(fixture.pkg('core'));
    await fixture.publish(fixture.pkg('provider', [fixture.dep('core')]));
    const plan = await fixture.service.installPlan('provider', '1.0.0');
    const changed = fixture.pkg('core');
    changed.attraccess.permissions = [];
    await fixture.publish(changed);
    await expect(fixture.service.install('provider', '1.0.0', undefined, undefined, plan.token)).rejects.toThrow(
      'plan changed',
    );
    expect(fixture.service.listInstalled()).toEqual([]);
    expect(fixture.internals.download).not.toHaveBeenCalled();
  });

  it('rejects registry and tarball dependency mismatches without installing anything', async () => {
    await fixture.publish(fixture.pkg('core'));
    await fixture.publish(fixture.pkg('provider', [fixture.dep('core')]));
    // Integrity is valid, but the tarball differs from the reviewed manifest.
    const value = fixture.pkg('provider', [fixture.dep('core', '^2')]);
    const buffer = await fixture.archive(value);
    fixture.archives.set('provider/1.0.0', buffer);
    (fixture.metadata.provider.versions['1.0.0'] as { dist: { integrity: string } }).dist.integrity =
      `sha512-${createHash('sha512').update(buffer).digest('base64')}`;
    const plan = await fixture.service.installPlan('provider', '1.0.0');
    await expect(fixture.service.install('provider', '1.0.0', undefined, undefined, plan.token)).rejects.toThrow(
      'does not match',
    );
    expect(fixture.service.listInstalled()).toEqual([]);
    expect(PluginService.getPlugins()).toEqual([]);
  });

  it.each(['download', 'state'])('rolls back the complete tree when %s fails', async (failure) => {
    await fixture.publish(fixture.pkg('core'));
    await fixture.publish(fixture.pkg('provider', [fixture.dep('core')]));
    const plan = await fixture.service.installPlan('provider', '1.0.0');
    if (failure === 'download') fixture.archives.delete('provider/1.0.0');
    else jest.spyOn(fixture.internals, 'writeRecords').mockRejectedValue(new Error('state failed'));
    await expect(fixture.service.install('provider', '1.0.0', undefined, undefined, plan.token)).rejects.toThrow(
      'failed',
    );
    expect(fixture.service.listInstalled()).toEqual([]);
    expect(PluginService.getPlugins()).toEqual([]);
    expect(PluginService.prototype.requestRestart).not.toHaveBeenCalled();
  });

  it('blocks incompatible upgrades and downgrades of dependencies and dependants', async () => {
    await fixture.publish(fixture.pkg('core'));
    await fixture.publish(fixture.pkg('provider', [fixture.dep('core')]));
    await fixture.install('provider');
    await fixture.publish(fixture.pkg('core', [], '2.0.0'));
    await fixture.publish(fixture.pkg('core', [], '0.9.0'));
    await fixture.publish(fixture.pkg('provider', [fixture.dep('core', '^2')], '1.1.0'));
    for (const version of ['2.0.0', '0.9.0']) {
      const candidate = (await fixture.service.installedVersionCandidates('core')).find(
        (item) => item.version === version,
      );
      expect(candidate.compatible).toBe(false);
      await expect(fixture.service.replaceInstalled('core', version, [], true)).rejects.toThrow('requires core');
    }
    await expect(fixture.service.replaceInstalled('provider', '1.1.0')).rejects.toThrow('requires core');
    expect(fixture.service.listInstalled().map(({ version }) => version)).toEqual(['1.0.0', '1.0.0']);
  });

  it('installs newly required plugins during a confirmed update, retaining existing dependencies', async () => {
    await fixture.publish(fixture.pkg('core'));
    await fixture.publish(fixture.pkg('provider', [fixture.dep('core')]));
    await fixture.install('provider');
    await fixture.publish(fixture.pkg('new-core'));
    await fixture.publish(fixture.pkg('provider', [fixture.dep('new-core')], '1.1.0'));
    const candidate = (await fixture.service.installedVersionCandidates('provider')).find(
      (candidate) => candidate.version === '1.1.0',
    );
    expect(candidate.compatible).toBe(true);
    const plan = await fixture.service.installPlan('provider', '1.1.0');
    await expect(fixture.service.replaceInstalled('provider', '1.1.0')).rejects.toThrow('requires confirmation');
    await fixture.service.replaceInstalled('provider', '1.1.0', [], false, undefined, plan.token);
    expect(fixture.service.listInstalled().map(({ name, version }) => [name, version])).toEqual([
      ['core', '1.0.0'],
      ['new-core', '1.0.0'],
      ['provider', '1.1.0'],
    ]);
  });

  it('protects dependencies and requires the exact transitive removal approval', async () => {
    await fixture.publish(fixture.pkg('core'));
    await fixture.publish(fixture.pkg('adapter', [fixture.dep('core')]));
    await fixture.publish(fixture.pkg('provider', [fixture.dep('adapter')]));
    await fixture.install('provider');
    await expect(fixture.service.removeInstalled('core')).rejects.toThrow('adapter, provider');
    await expect(fixture.service.removeInstalled('core', false, ['adapter'])).rejects.toThrow('required by');
    expect(fixture.service.listInstalled()).toHaveLength(3);
    await fixture.service.removeInstalled('core', false, ['adapter', 'provider']);
    expect(fixture.service.listInstalled()).toEqual([]);
    expect(PluginService.getPlugins()).toEqual([]);
  });

  it('restores all files and state when grouped removal fails to persist', async () => {
    await fixture.publish(fixture.pkg('core'));
    await fixture.publish(fixture.pkg('provider', [fixture.dep('core')]));
    await fixture.install('provider');
    const before = fixture.service.listInstalled();
    jest.spyOn(fixture.internals, 'writeRecords').mockRejectedValue(new Error('state failed'));
    await expect(fixture.service.removeInstalled('core', false, ['provider'])).rejects.toThrow('state failed');
    expect(fixture.service.listInstalled()).toEqual(before);
    expect(PluginService.getPlugins()).toHaveLength(2);
  });

  it('blocks subsequent state changes until a committed transaction journal is recovered', async () => {
    await fixture.publish(fixture.pkg('core'));
    await fixture.publish(fixture.pkg('provider', [fixture.dep('core')]));
    await fixture.publish(fixture.pkg('independent'));
    await fixture.install('provider');
    const before = fixture.service.listInstalled();
    writeFileSync(
      join(fixture.root, '.npm-plugin-transaction.json'),
      JSON.stringify({ after: readFileSync(join(fixture.root, '.npm-plugin-state.json'), 'utf8'), moves: [] }),
    );

    await expect(fixture.service.updateRequestedSpec('provider', '^1')).rejects.toThrow('restarting first');
    await expect(fixture.install('independent')).rejects.toThrow('restarting first');
    await expect(fixture.service.removeInstalled('core', false, ['provider'])).rejects.toThrow('restarting first');
    expect(fixture.service.listInstalled()).toEqual(before);
    expect(PluginService.getPlugins()).toHaveLength(2);

    await NpmPluginService.recoverBackups();
    await fixture.install('independent');
    expect(fixture.service.listInstalled()).toHaveLength(3);
  });

  it.each([false, true])('recovers a grouped file transaction after a crash (committed=%s)', async (committed) => {
    await fixture.publish(fixture.pkg('core'));
    await fixture.publish(fixture.pkg('provider', [fixture.dep('core')]));
    await fixture.install('provider');
    const installed = fixture.service.listInstalled();
    const moves = installed.map((plugin, index) => ({
      installPath: plugin.installPath,
      backupName: `${plugin.installPath}-00000000-0000-0000-0000-${String(index).padStart(12, '0')}`,
      hadTarget: true,
    }));
    mkdirSync(join(fixture.root, '.npm-backups'), { recursive: true });
    for (const move of moves)
      await rename(join(fixture.root, move.installPath), join(fixture.root, '.npm-backups', move.backupName));
    writeFileSync(join(fixture.root, '.npm-plugin-transaction.json'), JSON.stringify({ after: '[]', moves }));
    if (committed) writeFileSync(join(fixture.root, '.npm-plugin-state.json'), '[]');
    await NpmPluginService.recoverBackups();
    expect(PluginService.getPlugins()).toHaveLength(committed ? 0 : 2);
    expect(fixture.service.listInstalled()).toHaveLength(committed ? 0 : 2);
    expect(existsSync(join(fixture.root, '.npm-plugin-transaction.json'))).toBe(false);
  });
});
