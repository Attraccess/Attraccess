import { readdirSync } from 'fs';
import { PluginService } from './plugin.service';
import { registerNpmPluginDependencyLifecycleFixture } from './npm-plugin-dependencies.npm-plugin-dependency-lifecycle.test-fixture';

export function registerResolvesAndConfirmsTheCompleteDependencyTreeFromDistributionOnlyRegistryMeCases(
  fixture: ReturnType<typeof registerNpmPluginDependencyLifecycleFixture>,
) {
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
}

export function registerRestoresAllFilesAndStateWhenGroupedRemovalFailsToPersistCases(
  fixture: ReturnType<typeof registerNpmPluginDependencyLifecycleFixture>,
) {
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
}

export function registerReusesACompatibleDependencyWithoutDownloadingOrReplacingItCases(
  fixture: ReturnType<typeof registerNpmPluginDependencyLifecycleFixture>,
) {
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
}

export function registerRollsBackTheCompleteTreeWhenSFailsCases(
  fixture: ReturnType<typeof registerNpmPluginDependencyLifecycleFixture>,
) {
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
}

export function registerUsesTheRegistryPackagePublisherConsistentlyDuringPlanningAndInstallationCases(
  fixture: ReturnType<typeof registerNpmPluginDependencyLifecycleFixture>,
) {
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
}
