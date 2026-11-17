import { PLUGIN_HOST_DATA } from '../persistence/plugin-host-data.port';
import { createHostDataContext, type PluginHostRefs } from './host-contexts';

describe('createHostDataContext', () => {
  const dataSource = { name: 'host DataSource' };

  function hostWithAdapter(): { host: PluginHostRefs; getUsernames: jest.Mock } {
    const getUsernames = jest.fn().mockResolvedValue(new Map([[1, 'ada']]));
    const adapter = {
      users: { source: () => dataSource, getUsernames, internalHelper: () => 'internal' },
      resources: { source: () => dataSource },
      settings: {},
      flows: {},
    };
    const host = { get: (token: unknown) => (token === PLUGIN_HOST_DATA ? adapter : undefined) } as PluginHostRefs;
    return { host, getUsernames };
  }

  it('forwards the SDK interface methods to the host adapter, with the adapter as `this`', async () => {
    const { host, getUsernames } = hostWithAdapter();
    const hostData = createHostDataContext(host);

    await expect(hostData.users.getUsernames([1])).resolves.toEqual(new Map([[1, 'ada']]));
    expect(getUsernames).toHaveBeenCalledWith([1]);
  });

  it('exposes nothing of the adapter beyond the SDK interface', () => {
    const hostData = createHostDataContext(hostWithAdapter().host) as unknown as Record<
      string,
      Record<string, unknown>
    >;

    expect(hostData.users.source).toBeUndefined();
    expect(hostData.resources.source).toBeUndefined();
    expect(hostData.users.internalHelper).toBeUndefined();
    expect(Object.keys(hostData.users).sort()).toEqual(
      ['getLocales', 'getUsernames', 'isActive', 'listIdsWithAnyPermission'].sort(),
    );
    expect(Object.isFrozen(hostData.users)).toBe(true);
  });

  it('directories are not thenables, so awaiting one yields the directory itself', async () => {
    const hostData = createHostDataContext(hostWithAdapter().host);

    expect((hostData.resources as unknown as { then?: unknown }).then).toBeUndefined();
    await expect(Promise.resolve(hostData.resources)).resolves.toBe(hostData.resources);
  });
});
