import { createHash } from 'crypto';
import { projectAuditRow } from '../audit/recorder/audit-row';
import { NpmPluginService } from './npm-plugin.service';
import type { ServiceInternals } from './npm-plugin.test-fixture';
import { setupNpmPluginFixture } from './npm-plugin.test-fixture';
import { npmInternals } from './npm/fixtures/compose.test-fixture';
import { PluginAdministrationService } from './plugin-administration.service';
import { PluginService } from './plugin.service';
import { PluginUpdateScheduler } from './plugin-update-scheduler.service';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));

const NAME = '@attraccess/plugin-demo';
const OTHER = '@attraccess/plugin-other';
const OLD = '0.3.0-nightly.1.1';
const MIDDLE = '0.3.0-nightly.2.1';
const NEWEST = '0.3.0-nightly.3.1';
/** Only the clock is faked: the install path needs real timers and I/O. */
const REAL_TIMERS = [
  'nextTick',
  'setImmediate',
  'clearImmediate',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'queueMicrotask',
  'hrtime',
  'performance',
] as const;

/**
 * The scheduler with the real npm service, administration service and audit projection on real tarballs and state
 * files. Only the registry's network I/O and the process restart are replaced.
 */
describe('automatic plugin updates (integration)', () => {
  const fixture = setupNpmPluginFixture();
  const previousChannel = process.env.ATTRACCESS_PLUGIN_CHANNEL;
  // Monday 2026-11-30. The schedule is in Europe/Berlin (UTC+1), the instants in UTC: independent of the server zone.
  const outsideWindow = new Date('2026-11-30T12:00:00Z');
  const inWindow = new Date('2026-11-30T02:30:00Z');
  const EVERY_MONDAY = { weekdays: [1], startMinute: 180, durationMinutes: 120, timeZone: 'Europe/Berlin' };

  beforeEach(() => {
    process.env.ATTRACCESS_PLUGIN_CHANNEL = 'next';
    jest.useFakeTimers({ now: outsideWindow, doNotFake: [...REAL_TIMERS] });
  });

  afterEach(() => {
    jest.useRealTimers();
    if (previousChannel === undefined) delete process.env.ATTRACCESS_PLUGIN_CHANNEL;
    else process.env.ATTRACCESS_PLUGIN_CHANNEL = previousChannel;
  });

  type HostOptions = {
    permissionsOfNewVersions?: string[];
    installed?: string;
    published?: string[];
    /** Leave the update policy as a fresh host has it, with automatic updates off. */
    defaultPolicy?: boolean;
  };

  async function host(options: HostOptions = {}) {
    const stored: Record<string, string> = {};
    const service = new NpmPluginService({
      getPlainSetting: async (_parent: string, key: string) => stored[key],
      setPlainSetting: async (_parent: string, key: string, value: string) => {
        stored[key] = value;
      },
      getSecretSetting: async () => ({ configured: false, value: null }),
    } as never);
    const internals = npmInternals(service);
    const published = new Map<string, { versions: Record<string, unknown>; next: string; tarballs: string[] }>();
    const tarballs = new Map<string, Buffer>();

    const publish = async (name: string, version: string, permissions: string[] = []) => {
      const tarball = await fixture.packageTarball(name, permissions, { version });
      const url = `${name}@${version}`;
      tarballs.set(url, tarball);
      const entry = published.get(name) ?? { versions: {}, next: version, tarballs: [] };
      entry.versions[version] = {
        name,
        version,
        keywords: ['attraccess-plugin'],
        peerDependencies: { '@attraccess/plugins-backend-sdk': '*' },
        attraccess: {
          displayName: name,
          host: '>=2.0.0-0',
          backend: 'dist/index.js',
          permissions,
          sdk: { backend: '*' },
        },
        dist: { tarball: url, shasum: createHash('sha1').update(tarball).digest('hex') },
      };
      entry.next = version;
      published.set(name, entry);
    };
    jest.spyOn(internals.catalog as unknown as ServiceInternals, 'hostVersion').mockReturnValue('2.0.0');
    jest.spyOn(internals.catalog, 'packageMetadata').mockImplementation(async (name: string) => {
      const entry = published.get(name);
      return { name, 'dist-tags': { next: entry.next, latest: entry.next }, versions: entry.versions };
    });
    const download = jest
      .spyOn(internals.registry, 'download')
      .mockImplementation(async (url: string) => tarballs.get(url));

    const pluginService = new PluginService();
    const restart = jest.spyOn(pluginService, 'requestRestart');
    restart.mockClear();
    const audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };
    const administration = new PluginAdministrationService(pluginService, {} as never, service, audit as never);
    const scheduler = new PluginUpdateScheduler(service, administration, pluginService);

    for (const name of [NAME, OTHER]) {
      await publish(name, options.installed ?? OLD);
      await service.install(name, undefined);
    }
    restart.mockClear();
    if (!options.defaultPolicy) await service.setUpdatePolicy({ automaticUpdates: true, schedule: EVERY_MONDAY });
    for (const name of [NAME, OTHER])
      for (const version of options.published ?? [MIDDLE, NEWEST])
        await publish(name, version, options.permissionsOfNewVersions);
    const versions = () => Object.fromEntries(service.listInstalled().map((plugin) => [plugin.name, plugin.version]));
    const runAt = async (now: Date) => {
      jest.setSystemTime(now);
      await scheduler.run();
    };
    const rows = () => audit.record.mock.calls.map(([event]) => projectAuditRow(event));
    return { service, scheduler, restart, audit, download, publish, versions, runAt, rows };
  }

  it('offers the update outside the window and installs the newest one inside it, with one restart', async () => {
    const { service, restart, versions, runAt, rows } = await host();

    await runAt(outsideWindow);
    expect(versions()).toEqual({ [NAME]: OLD, [OTHER]: OLD });
    for (const plugin of service.listInstalled())
      expect(plugin.updateCheck).toMatchObject({ state: 'available', candidate: NEWEST });
    expect(rows()).toEqual([]);

    await runAt(inWindow);
    expect(versions()).toEqual({ [NAME]: NEWEST, [OTHER]: NEWEST });
    for (const plugin of service.listInstalled())
      expect(plugin).toMatchObject({ requestedSpec: 'next', knownGoodVersion: OLD, state: 'active' });
    expect(restart).toHaveBeenCalledTimes(1);
    expect(rows()).toHaveLength(2);
    for (const row of rows())
      expect(row).toMatchObject({
        domain: 'administration',
        action: 'plugin.replaced',
        actorId: null,
        authenticationMethod: null,
        outcome: 'succeeded',
        details: expect.objectContaining({ oldVersion: OLD, newVersion: NEWEST }),
      });
  });

  it('records how an automatic update activated after the restart, still as the system actor', async () => {
    const { service, runAt } = await host();
    await runAt(inWindow);
    const audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };
    jest
      .spyOn(PluginService, 'getPluginsWithLoadStatus')
      .mockReturnValue(
        service.listInstalled().map(({ name, version }) => ({ name, version, status: 'loaded' }) as never),
      );
    const restarted = new NpmPluginService(
      { getPlainSetting: async () => undefined } as never,
      undefined,
      audit as never,
      { list: async () => ({ items: [] }) } as never,
    );

    await restarted.onApplicationBootstrap();

    expect(audit.record.mock.calls.map(([event]) => projectAuditRow(event))).toEqual(
      [NAME, OTHER].map(() =>
        expect.objectContaining({
          action: 'plugin.activation_completed',
          actorId: null,
          authenticationMethod: null,
          outcome: 'succeeded',
        }),
      ),
    );
  });

  it('keeps the installed version when the install fails, audits it and does not retry it at once', async () => {
    const { service, restart, download, publish, versions, runAt, rows } = await host();
    const fetch = download.getMockImplementation();
    download.mockImplementation(async (url, registry) => {
      if (url.startsWith(NAME)) throw new Error('registry unavailable');
      return fetch(url, registry);
    });

    await runAt(inWindow);
    expect(versions()).toEqual({ [NAME]: OLD, [OTHER]: NEWEST });
    expect(restart).toHaveBeenCalledTimes(1);
    expect(
      rows()
        .map((row) => row.outcome)
        .sort(),
    ).toEqual(['failed', 'succeeded']);
    expect(service.listInstalled().find((plugin) => plugin.name === NAME).autoUpdateFailure).toMatchObject({
      version: NEWEST,
    });

    // The restarted host has a new scheduler; the failure is on disk, so the same version is left alone.
    const attempts = download.mock.calls.length;
    const notCalled = { applyAutomaticUpdate: jest.fn() };
    const restarted = new PluginUpdateScheduler(service, notCalled as never, { requestRestart: restart } as never);
    jest.setSystemTime(new Date(inWindow.getTime() + 5 * 60_000));
    await restarted.run();
    expect(notCalled.applyAutomaticUpdate).not.toHaveBeenCalled();
    expect(download).toHaveBeenCalledTimes(attempts);

    // A newer build is tried right away.
    download.mockImplementation(fetch);
    await publish(NAME, '0.3.0-nightly.4.1');
    const next = new PluginUpdateScheduler(
      service,
      new PluginAdministrationService(new PluginService(), {} as never, service, {
        record: jest.fn().mockResolvedValue({ status: 'recorded' }),
      } as never),
      new PluginService(),
    );
    const anHourLater = new Date(inWindow.getTime() + 61 * 60_000);
    jest.setSystemTime(anHourLater);
    await next.run();
    expect(versions()[NAME]).toBe('0.3.0-nightly.4.1');
  });

  it.each(['off', 'patch'] as const)('leaves a plugin whose update setting is %s', async (override) => {
    const { service, versions, runAt } = await host();
    await service.updateOverride(NAME, override);
    await runAt(inWindow);
    expect(versions()).toEqual({ [NAME]: OLD, [OTHER]: NEWEST });
  });

  it('installs nothing that asks for more permissions', async () => {
    const { restart, versions, runAt, rows } = await host({ permissionsOfNewVersions: ['READ_USERS'] });
    await runAt(inWindow);
    expect(versions()).toEqual({ [NAME]: OLD, [OTHER]: OLD });
    expect(restart).not.toHaveBeenCalled();
    expect(rows()).toEqual([]);
  });

  it.each(['next', 'latest'])(
    'on a fresh %s host, offers updates and never installs or restarts, in or outside any hour',
    async (channel) => {
      process.env.ATTRACCESS_PLUGIN_CHANNEL = channel;
      const { service, restart, versions, runAt, rows } = await host({
        defaultPolicy: true,
        installed: '1.0.0',
        published: ['1.0.1'],
      });
      expect(await service.getUpdatePolicy()).toMatchObject({ checksEnabled: true, automaticUpdates: false });

      for (let hour = 0; hour < 24; hour += 1) await runAt(new Date(Date.UTC(2026, 10, 30, hour, 30)));

      expect(service.listInstalled().map((plugin) => plugin.updateCheck)).toEqual(
        [NAME, OTHER].map(() => expect.objectContaining({ state: 'available', candidate: '1.0.1' })),
      );
      expect(versions()).toEqual({ [NAME]: '1.0.0', [OTHER]: '1.0.0' });
      expect(restart).not.toHaveBeenCalled();
      expect(rows()).toEqual([]);
    },
  );

  it.each(['inherit', 'patch', 'minor', 'follow'] as const)(
    'installs nothing with the switch off, whatever the plugin override says (%s)',
    async (override) => {
      const { service, restart, versions, runAt } = await host({ installed: '1.0.0', published: ['1.0.1'] });
      await service.setUpdatePolicy({ automaticUpdates: false });
      await service.updateOverride(NAME, override);
      await runAt(inWindow);
      expect(versions()).toEqual({ [NAME]: '1.0.0', [OTHER]: '1.0.0' });
      expect(restart).not.toHaveBeenCalled();
    },
  );

  it('lets a plugin widen to follow while the global step is patch', async () => {
    const { service, versions, runAt } = await host();
    await service.setUpdatePolicy({ mode: 'patch' });
    await service.updateOverride(NAME, 'follow');
    await runAt(inWindow);
    // A nightly step is more than a patch step: only the plugin that was widened takes it.
    expect(versions()).toEqual({ [NAME]: NEWEST, [OTHER]: OLD });
  });

  it.each([
    ['checks are disabled', { checksEnabled: false }],
    ['the step limit is patch', { mode: 'patch' }],
    ['another weekday is chosen', { schedule: { weekdays: [2] } }],
    ['the window is at another time', { schedule: { startMinute: 12 * 60, durationMinutes: 10 } }],
    ['the same clock time is meant in another zone', { schedule: { timeZone: 'America/New_York' } }],
  ])('installs nothing when %s', async (_label, patch) => {
    const { service, restart, versions, runAt } = await host();
    await service.setUpdatePolicy(patch);
    await runAt(inWindow);
    expect(versions()).toEqual({ [NAME]: OLD, [OTHER]: OLD });
    expect(restart).not.toHaveBeenCalled();
  });

  it('on a next host with automatic updates on, plugins that request latest stay off nightlies', async () => {
    const { service, publish, versions, runAt } = await host();
    await service.updateRequestedSpec(NAME, 'latest');
    await publish(NAME, '0.4.0-nightly.1.1');
    await runAt(inWindow);
    // The registry's latest is this prerelease too, but only a plugin that requests next follows prereleases.
    expect(versions()).toEqual({ [NAME]: OLD, [OTHER]: NEWEST });
  });

  it('on a release host, installs the newest patch or minor release and no prerelease or major', async () => {
    process.env.ATTRACCESS_PLUGIN_CHANNEL = 'latest';
    const { service, restart, versions, runAt } = await host({
      installed: '1.0.0',
      published: ['1.0.1', '1.1.0', '1.2.0-beta.1', '2.0.0'],
    });
    expect(service.listInstalled()[0].requestedSpec).toBe('latest');

    await runAt(inWindow);

    expect(versions()).toEqual({ [NAME]: '1.1.0', [OTHER]: '1.1.0' });
    expect(restart).toHaveBeenCalledTimes(1);
  });
});
