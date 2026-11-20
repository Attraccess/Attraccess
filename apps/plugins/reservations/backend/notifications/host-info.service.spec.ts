import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { HostInfoService, normalizeLanguage } from './host-info.service';

/** The queries run in the host's `hostData` adapter (tested there on real host tables); this covers the mapping. */
describe('HostInfoService', () => {
  const settings = new Map<string, string>();
  const locales = new Map<number, string | null>();
  const hostData = {
    settings: { getApp: jest.fn(async (key: string) => settings.get(key) ?? null) },
    users: {
      getLocales: jest.fn(
        async (ids: number[]) =>
          new Map(ids.filter((id) => locales.has(id)).map((id) => [id, locales.get(id) ?? null] as const)),
      ),
      listIdsWithAnyPermission: jest.fn(async (_keys: string[]) => [1, 4]),
    },
    resources: {
      countUnhealthyEntries: jest.fn(async (id: number) => (id === 1 ? 1 : 0)),
      listIntroducerUserIds: jest.fn(async (_id: number) => [3, 4]),
    },
  };
  const info = new HostInfoService({ hostData } as unknown as PluginContext);

  beforeEach(() => {
    settings.clear();
    locales.clear();
  });

  it('normalizes locales', () => {
    expect(normalizeLanguage('de-AT', 'en')).toBe('de');
    expect(normalizeLanguage('EN_gb', 'de')).toBe('en');
    expect(normalizeLanguage('fr', 'de')).toBe('de');
    expect(normalizeLanguage(null, 'en')).toBe('en');
  });

  it('reads the public base URL like core and trims the trailing slash', async () => {
    expect(await info.getBaseUrl()).toBeNull();
    settings.set('backend_url', 'https://makerspace.test/');
    expect(await info.getBaseUrl()).toBe('https://makerspace.test');
  });

  it('resolves languages: supported locale first, then the installation default (German when never configured)', async () => {
    locales.set(1, 'en').set(8, 'de-AT').set(9, 'fr');
    expect([...(await info.languagesOf([1, 8, 9, 404]))]).toEqual([
      [1, 'en'],
      [8, 'de'],
      [9, 'de'],
      [404, 'de'],
    ]);
    settings.set('default_language', 'en');
    expect((await info.languagesOf([9])).get(9)).toBe('en');
    expect((await info.languagesOf([])).size).toBe(0);
  });

  it('merges permission holders and introducers into the manager set', async () => {
    expect((await info.managerIdsOf(1)).sort()).toEqual([1, 3, 4]);
    expect(hostData.users.listIdsWithAnyPermission).toHaveBeenCalledWith(['resources.update']);
  });

  it('counts unhealthy health entries', async () => {
    expect(await info.countUnhealthyEntries(1)).toBe(1);
    expect(await info.countUnhealthyEntries(2)).toBe(0);
  });
});
