import { projectAuditRow } from '../audit/recorder/audit-row';
import { DEFAULT_PLUGIN_UPDATE_POLICY } from './npm/update-policy';
import { registerNpmPluginDependencyLifecycleFixture } from './npm-plugin-dependencies.npm-plugin-dependency-lifecycle.test-fixture';
import { PluginAdministrationService } from './plugin-administration.service';
import { PluginService } from './plugin.service';

/** What an automatic update refuses, so that it stays offered for a manual install. */
describe('PluginAdministrationService.applyAutomaticUpdate', () => {
  const fixture = registerNpmPluginDependencyLifecycleFixture();

  async function hostWithProvider() {
    await fixture.publish(fixture.pkg('core'));
    await fixture.publish(fixture.pkg('provider', [fixture.dep('core')]));
    fixture.metadata.provider.versions['1.0.0'] = {
      ...(fixture.metadata.provider.versions['1.0.0'] as object),
      _npmUser: { name: 'GitHub Actions' },
    };
    await fixture.install('provider');
    const audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };
    const administration = new PluginAdministrationService(
      new PluginService(),
      {} as never,
      fixture.service,
      audit as never,
    );
    const versions = () => fixture.service.listInstalled().map(({ name, version }) => [name, version]);
    return { administration, audit, versions };
  }

  /** `fields` are written into the package itself, where its author controls them. */
  const publishProvider = async (dependency: string, publisher = 'GitHub Actions', fields: object = {}) => {
    await fixture.publish(fixture.pkg('provider', [fixture.dep(dependency)], '1.1.0'));
    fixture.metadata.provider.versions['1.1.0'] = {
      ...(fixture.metadata.provider.versions['1.1.0'] as object),
      ...fields,
      _npmUser: { name: publisher },
    };
  };

  it('installs an update whose dependencies are already installed, leaving the restart to the caller', async () => {
    const { administration, versions } = await hostWithProvider();
    await publishProvider('core');
    const restart = jest.fn();

    await administration.applyAutomaticUpdate('provider', '1.1.0', restart);

    expect(versions()).toEqual([
      ['core', '1.0.0'],
      ['provider', '1.1.0'],
    ]);
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it('refuses an update that needs another plugin installed', async () => {
    const { administration, audit, versions } = await hostWithProvider();
    await fixture.publish(fixture.pkg('new-core'));
    await publishProvider('new-core');
    const restart = jest.fn();

    await expect(administration.applyAutomaticUpdate('provider', '1.1.0', restart)).rejects.toThrow(
      'needs other plugins',
    );

    expect(versions()).toEqual([
      ['core', '1.0.0'],
      ['provider', '1.0.0'],
    ]);
    expect(restart).not.toHaveBeenCalled();
    expect(audit.record.mock.calls.map(([event]) => projectAuditRow(event))).toEqual([
      expect.objectContaining({ action: 'plugin.replaced', actorId: null, outcome: 'failed' }),
    ]);
  });

  it('announces an update from another publisher, but does not offer it to automatic updates', async () => {
    await hostWithProvider();
    await publishProvider('core', 'someone-else');
    // Automatic updates are off by default: the check only announces, and a plugin manager installs by hand.
    expect((await fixture.service.checkInstalled('provider')).updateCheck).toMatchObject({
      state: 'available',
      candidate: '1.1.0',
    });

    // The fixture's settings store only reads; this is what a plugin manager's saved policy looks like.
    const settings = (fixture.service as unknown as { settings: { getPlainSetting: jest.Mock } }).settings;
    settings.getPlainSetting.mockResolvedValue(
      JSON.stringify({
        ...DEFAULT_PLUGIN_UPDATE_POLICY,
        automaticUpdates: true,
        schedule: { ...DEFAULT_PLUGIN_UPDATE_POLICY.schedule, weekdays: [1] },
      }),
    );
    expect((await fixture.service.checkInstalled('provider')).updateCheck).toMatchObject({
      state: 'blocked',
      candidate: null,
    });
    await publishProvider('core');
    expect((await fixture.service.checkInstalled('provider')).updateCheck).toMatchObject({
      state: 'available',
      candidate: '1.1.0',
    });
  });

  it('compares the uploader the registry recorded, not a publisher the package names itself', async () => {
    const { administration, versions } = await hostWithProvider();
    await publishProvider('core', 'someone-else', { publisher: 'GitHub Actions', maintainers: ['GitHub Actions'] });

    await expect(administration.applyAutomaticUpdate('provider', '1.1.0', jest.fn())).rejects.toThrow(
      '1.1.0 was published by someone-else, not GitHub Actions',
    );
    expect(versions()).toContainEqual(['provider', '1.0.0']);
  });

  it('refuses an update without a recorded uploader when the installed version has one', async () => {
    const { administration } = await hostWithProvider();
    await fixture.publish(fixture.pkg('provider', [fixture.dep('core')], '1.1.0'));

    await expect(administration.applyAutomaticUpdate('provider', '1.1.0', jest.fn())).rejects.toThrow(
      '1.1.0 was published by an unknown npm user, not GitHub Actions',
    );
  });

  it('refuses an update from another publisher', async () => {
    const { administration, versions } = await hostWithProvider();
    await publishProvider('core', 'someone-else');

    await expect(administration.applyAutomaticUpdate('provider', '1.1.0', jest.fn())).rejects.toThrow(
      '1.1.0 was published by someone-else, not GitHub Actions',
    );
    expect(versions()).toContainEqual(['provider', '1.0.0']);
  });

  it('refuses an update from a registry without HTTPS', async () => {
    const { administration } = await hostWithProvider();
    await publishProvider('core');
    const installed = fixture.service.listInstalled();
    jest
      .spyOn(fixture.service, 'listInstalled')
      .mockReturnValue(installed.map((plugin) => ({ ...plugin, registryUrl: 'http://registry.example.org' })));

    await expect(administration.applyAutomaticUpdate('provider', '1.1.0', jest.fn())).rejects.toThrow(
      'does not use HTTPS',
    );
  });
});
