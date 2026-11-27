import type { InstalledNpmPlugin } from './npm-plugin.service';
import { DEFAULT_PLUGIN_UPDATE_POLICY, PluginUpdatePolicy } from './npm/update-policy';
import {
  FAILED_UPDATE_RETRY_MS,
  INSTALL_TIME_RESERVE_MS,
  PluginUpdateScheduler,
  UPDATE_CHECK_INTERVAL_MS,
} from './plugin-update-scheduler.service';

// 2026-11-30 is a Monday. All instants are UTC, so these specs do not depend on the server's zone.
const at = (instant: string) => new Date(instant);
const IN_WINDOW = at('2026-11-30T03:30:00Z');

type Check = NonNullable<InstalledNpmPlugin['updateCheck']>;
const offer = (checkedAt: Date, candidate = '1.1.0'): Check => ({
  checkedAt: checkedAt.toISOString(),
  candidate,
  state: 'available',
  error: null,
});

/** Switched on, Mondays 03:00 to 05:00 UTC. */
const ENABLED: PluginUpdatePolicy = {
  ...DEFAULT_PLUGIN_UPDATE_POLICY,
  automaticUpdates: true,
  schedule: { weekdays: [1], startMinute: 180, durationMinutes: 120, timeZone: 'UTC' },
};

const clock = (instant: Date) => jest.setSystemTime(instant);

function setup(plugins: Array<Partial<InstalledNpmPlugin>> = [{}], policy: PluginUpdatePolicy = ENABLED) {
  const installed = plugins.map(
    (plugin, index) => ({ name: `plugin-${index}`, version: '1.0.0', ...plugin }) as InstalledNpmPlugin,
  );
  const current = { policy };
  const npm = {
    listInstalled: jest.fn(() => installed),
    getUpdatePolicy: jest.fn(async () => current.policy),
    // A check offers what the registry has now: the same candidate unless a test changes it.
    checkInstalled: jest.fn(async (name: string) => {
      const plugin = installed.find((item) => item.name === name);
      const now = new Date();
      plugin.updateCheck = plugin.updateCheck ? { ...plugin.updateCheck, checkedAt: now.toISOString() } : offer(now);
      return plugin;
    }),
    recordAutoUpdateFailure: jest.fn(async (name: string, version: string, failedAt: Date) => {
      installed.find((item) => item.name === name).autoUpdateFailure = { version, failedAt: failedAt.toISOString() };
    }),
  };
  const administration = {
    applyAutomaticUpdate: jest.fn(async (_name: string, _version: string, restart: () => void) => restart()),
  };
  const pluginService = { requestRestart: jest.fn() };
  const scheduler = new PluginUpdateScheduler(npm as never, administration as never, pluginService as never);
  const runAt = (instant: Date) => {
    clock(instant);
    return scheduler.run();
  };
  return { scheduler, runAt, npm, administration, pluginService, installed, current };
}

describe('PluginUpdateScheduler', () => {
  beforeEach(() => jest.useFakeTimers({ now: IN_WINDOW }));
  afterEach(() => jest.useRealTimers());

  describe('installs only when a plugin manager switched it on and only inside the schedule', () => {
    it.each<[string, PluginUpdatePolicy, Date]>([
      ['the switch is off, as by default', { ...ENABLED, automaticUpdates: false }, IN_WINDOW],
      ['the policy is the default one', DEFAULT_PLUGIN_UPDATE_POLICY, IN_WINDOW],
      ['the weekday is not chosen', ENABLED, at('2026-12-01T03:30:00Z')],
      ['the window has not opened', ENABLED, at('2026-11-30T02:59:00Z')],
      ['the window has closed', ENABLED, at('2026-11-30T05:00:00Z')],
      [
        // 03:30 UTC on Monday is 12:30 in Tokyo, whatever the server's TZ says.
        'it is outside the window in the chosen zone',
        { ...ENABLED, schedule: { ...ENABLED.schedule, timeZone: 'Asia/Tokyo' } },
        IN_WINDOW,
      ],
    ])('checks but installs and restarts nothing when %s', async (_label, policy, now) => {
      const { runAt, npm, administration, pluginService } = setup([{}], policy);
      await runAt(now);
      expect(npm.checkInstalled).toHaveBeenCalledWith('plugin-0');
      expect(administration.applyAutomaticUpdate).not.toHaveBeenCalled();
      expect(pluginService.requestRestart).not.toHaveBeenCalled();
    });

    it.each<[string, Partial<PluginUpdatePolicy['schedule']>, Date]>([
      ['inside the window', {}, IN_WINDOW],
      ['inside the window of the chosen zone', { timeZone: 'Asia/Tokyo' }, at('2026-11-29T18:30:00Z')],
      [
        'past midnight of a window that started on the chosen day',
        { startMinute: 23 * 60 },
        at('2026-12-01T00:30:00Z'),
      ],
      [
        'in the local-time window after a daylight saving change',
        { weekdays: [7], startMinute: 4 * 60, durationMinutes: 60, timeZone: 'Europe/Berlin' },
        at('2027-03-28T02:30:00Z'),
      ],
    ])('installs and restarts %s', async (_label, schedule, now) => {
      const { runAt, administration, pluginService } = setup([{}], {
        ...ENABLED,
        schedule: { ...ENABLED.schedule, ...schedule },
      });
      await runAt(now);
      expect(administration.applyAutomaticUpdate).toHaveBeenCalledTimes(1);
      expect(pluginService.requestRestart).toHaveBeenCalledTimes(1);
    });

    it('neither checks nor installs with update checks off', async () => {
      const { runAt, npm, administration } = setup([{ updateCheck: offer(at('2026-01-01T00:00:00Z')) }], {
        ...ENABLED,
        checksEnabled: false,
      });
      await runAt(IN_WINDOW);
      expect(npm.checkInstalled).not.toHaveBeenCalled();
      expect(administration.applyAutomaticUpdate).not.toHaveBeenCalled();
    });

    it('does not start an install the rest of the window has no room for', async () => {
      const late = new Date(at('2026-11-30T05:00:00Z').getTime() - INSTALL_TIME_RESERVE_MS + 1000);
      const { runAt, administration } = setup();
      await runAt(late);
      expect(administration.applyAutomaticUpdate).not.toHaveBeenCalled();

      const inTime = setup();
      await inTime.runAt(new Date(late.getTime() - 1000));
      expect(inTime.administration.applyAutomaticUpdate).toHaveBeenCalledTimes(1);
    });

    it('still installs in a window shorter than the reserve', async () => {
      const { runAt, administration } = setup([{}], {
        ...ENABLED,
        schedule: { ...ENABLED.schedule, durationMinutes: 1 },
      });
      await runAt(at('2026-11-30T03:00:05Z'));
      expect(administration.applyAutomaticUpdate).toHaveBeenCalledTimes(1);
    });

    it('stops starting installs and holds the restart back once the window closed during an install', async () => {
      const { scheduler, runAt, administration, pluginService, current } = setup([{}, {}]);
      administration.applyAutomaticUpdate.mockImplementationOnce(async (_name, _version, restart) => {
        clock(at('2026-11-30T05:01:00Z'));
        restart();
      });
      await runAt(IN_WINDOW);
      expect(administration.applyAutomaticUpdate).toHaveBeenCalledTimes(1);
      expect(pluginService.requestRestart).not.toHaveBeenCalled();

      // Not on a day without a window either.
      clock(at('2026-12-01T03:30:00Z'));
      await scheduler.run();
      expect(pluginService.requestRestart).not.toHaveBeenCalled();

      // The next window installs the rest and restarts once.
      current.policy = ENABLED;
      await runAt(at('2026-12-07T03:30:00Z'));
      expect(pluginService.requestRestart).toHaveBeenCalledTimes(1);
    });

    it('does not restart after a plugin manager switched it off during an install', async () => {
      const { runAt, administration, pluginService, current } = setup([{}, {}]);
      administration.applyAutomaticUpdate.mockImplementationOnce(async (_name, _version, restart) => {
        current.policy = { ...ENABLED, automaticUpdates: false };
        restart();
      });
      await runAt(IN_WINDOW);
      expect(administration.applyAutomaticUpdate).toHaveBeenCalledTimes(1);
      expect(pluginService.requestRestart).not.toHaveBeenCalled();
    });
  });

  it('checks again only once the last check is stale', async () => {
    const now = at('2026-11-30T12:00:00Z');
    const fresh = new Date(now.getTime() - UPDATE_CHECK_INTERVAL_MS + 1000);
    const stale = new Date(now.getTime() - UPDATE_CHECK_INTERVAL_MS);
    const { runAt, npm } = setup([{ updateCheck: offer(fresh) }, { updateCheck: offer(stale) }]);
    await runAt(now);
    expect(npm.checkInstalled.mock.calls).toEqual([['plugin-1']]);
  });

  it('checks again when a window has opened since the last check', async () => {
    const { runAt, npm } = setup([{ updateCheck: { ...offer(at('2026-11-30T02:55:00Z')), state: 'up-to-date' } }]);
    await runAt(at('2026-11-30T03:01:00Z'));
    expect(npm.checkInstalled).toHaveBeenCalledTimes(1);
  });

  it('does not read the policy without installed npm plugins', async () => {
    const { runAt, npm } = setup([]);
    await runAt(IN_WINDOW);
    expect(npm.getUpdatePolicy).not.toHaveBeenCalled();
  });

  it('installs every offered update and restarts once', async () => {
    const { scheduler, runAt, administration, pluginService } = setup([
      { updateCheck: offer(IN_WINDOW) },
      { updateCheck: { ...offer(IN_WINDOW), state: 'blocked', candidate: null } },
      { updateCheck: offer(IN_WINDOW, '2.3.4') },
    ]);
    await runAt(IN_WINDOW);
    expect(administration.applyAutomaticUpdate.mock.calls.map(([name, version]) => [name, version])).toEqual([
      ['plugin-0', '1.1.0'],
      ['plugin-2', '2.3.4'],
    ]);
    expect(pluginService.requestRestart).toHaveBeenCalledTimes(1);

    await scheduler.run();
    expect(administration.applyAutomaticUpdate).toHaveBeenCalledTimes(2);
  });

  it('lets the check made right before the install decide', async () => {
    const { runAt, npm, administration, installed } = setup([{ updateCheck: offer(IN_WINDOW) }]);
    npm.checkInstalled.mockImplementation(async () => {
      // A plugin manager switched the plugin off since the offer was made.
      installed[0].updateCheck = { ...offer(IN_WINDOW), state: 'blocked', candidate: null };
      return installed[0];
    });
    await runAt(IN_WINDOW);
    expect(administration.applyAutomaticUpdate).not.toHaveBeenCalled();
  });

  it('records a failed install, goes on with the others and restarts for them', async () => {
    const { runAt, npm, administration, pluginService } = setup([
      { updateCheck: offer(IN_WINDOW) },
      { updateCheck: offer(IN_WINDOW) },
    ]);
    administration.applyAutomaticUpdate.mockRejectedValueOnce(new Error('Replacement blocked'));
    await runAt(IN_WINDOW);
    expect(npm.recordAutoUpdateFailure).toHaveBeenCalledWith('plugin-0', '1.1.0', IN_WINDOW);
    expect(administration.applyAutomaticUpdate).toHaveBeenCalledTimes(2);
    expect(pluginService.requestRestart).toHaveBeenCalledTimes(1);
  });

  it('retries a failed version only after the pause, and a newer version at once', async () => {
    const failedAt = new Date(IN_WINDOW.getTime() - FAILED_UPDATE_RETRY_MS + 1000).toISOString();
    const autoUpdateFailure = { version: '1.1.0', failedAt };
    const held = setup([{ updateCheck: offer(IN_WINDOW), autoUpdateFailure }]);
    await held.runAt(IN_WINDOW);
    expect(held.administration.applyAutomaticUpdate).not.toHaveBeenCalled();

    const newer = setup([{ updateCheck: offer(IN_WINDOW, '1.2.0'), autoUpdateFailure }]);
    await newer.runAt(IN_WINDOW);
    expect(newer.administration.applyAutomaticUpdate).toHaveBeenCalledTimes(1);

    const retried = setup([{ updateCheck: offer(IN_WINDOW), autoUpdateFailure }]);
    await retried.runAt(new Date(IN_WINDOW.getTime() + 2000));
    expect(retried.administration.applyAutomaticUpdate).toHaveBeenCalledTimes(1);
  });

  it('does not restart when nothing was installed', async () => {
    const { runAt, administration, pluginService } = setup([{ updateCheck: offer(IN_WINDOW) }]);
    administration.applyAutomaticUpdate.mockRejectedValue(new Error('nope'));
    await runAt(IN_WINDOW);
    expect(pluginService.requestRestart).not.toHaveBeenCalled();
  });

  it('does not start a second pass while one is running', async () => {
    const { scheduler, npm } = setup([{}]);
    let finish: () => void;
    npm.getUpdatePolicy.mockImplementationOnce(
      () => new Promise((resolve) => (finish = () => resolve({ ...ENABLED, checksEnabled: false }))),
    );
    const first = scheduler.run();
    await scheduler.run();
    finish();
    await first;
    expect(npm.getUpdatePolicy).toHaveBeenCalledTimes(1);
  });

  it('survives a failing pass', async () => {
    const { scheduler, npm } = setup([{}]);
    npm.getUpdatePolicy.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(scheduler.tick()).resolves.toBeUndefined();
  });
});
