import type { InstalledNpmPlugin } from './npm-plugin.service';
import {
  FAILED_UPDATE_RETRY_MS,
  PluginUpdateScheduler,
  UPDATE_CHECK_INTERVAL_MS,
} from './plugin-update-scheduler.service';

const inWindow = new Date(2026, 10, 26, 3, 30);
const outsideWindow = new Date(2026, 10, 26, 12, 0);

type Check = NonNullable<InstalledNpmPlugin['updateCheck']>;
const offer = (checkedAt: Date, candidate = '1.1.0'): Check => ({
  checkedAt: checkedAt.toISOString(),
  candidate,
  state: 'available',
  error: null,
});

function setup(plugins: Array<Partial<InstalledNpmPlugin>>, checksEnabled = true, now = inWindow) {
  const installed = plugins.map(
    (plugin, index) => ({ name: `plugin-${index}`, version: '1.0.0', ...plugin }) as InstalledNpmPlugin,
  );
  const npm = {
    listInstalled: jest.fn(() => installed),
    getUpdatePolicy: jest.fn().mockResolvedValue({
      checksEnabled,
      mode: 'minor',
      prerelease: false,
      maintenanceWindow: { startMinute: 180, durationMinutes: 120 },
    }),
    // A check offers what the registry has now: the same candidate unless a test changes it.
    checkInstalled: jest.fn(async (name: string) => {
      const plugin = installed.find((item) => item.name === name);
      plugin.updateCheck = plugin.updateCheck ? { ...plugin.updateCheck, checkedAt: now.toISOString() } : offer(now);
      return plugin;
    }),
    recordAutoUpdateFailure: jest.fn(async (name: string, version: string, at: Date) => {
      installed.find((item) => item.name === name).autoUpdateFailure = { version, failedAt: at.toISOString() };
    }),
  };
  const administration = {
    applyAutomaticUpdate: jest.fn(async (_name: string, _version: string, restart: () => void) => restart()),
  };
  const pluginService = { requestRestart: jest.fn() };
  const scheduler = new PluginUpdateScheduler(npm as never, administration as never, pluginService as never);
  return { scheduler, npm, administration, pluginService, installed };
}

describe('PluginUpdateScheduler', () => {
  it('only checks outside the maintenance window', async () => {
    const { scheduler, npm, administration, pluginService } = setup([{}], true, outsideWindow);
    await scheduler.run(outsideWindow);
    expect(npm.checkInstalled).toHaveBeenCalledWith('plugin-0');
    expect(administration.applyAutomaticUpdate).not.toHaveBeenCalled();
    expect(pluginService.requestRestart).not.toHaveBeenCalled();
  });

  it('checks again only once the last check is stale', async () => {
    const fresh = new Date(outsideWindow.getTime() - UPDATE_CHECK_INTERVAL_MS + 1000);
    const stale = new Date(outsideWindow.getTime() - UPDATE_CHECK_INTERVAL_MS);
    const { scheduler, npm } = setup(
      [{ updateCheck: offer(fresh) }, { updateCheck: offer(stale) }],
      true,
      outsideWindow,
    );
    await scheduler.run(outsideWindow);
    expect(npm.checkInstalled.mock.calls).toEqual([['plugin-1']]);
  });

  it('checks again when the window has opened since the last check', async () => {
    const beforeWindow = new Date(2026, 10, 26, 2, 55);
    const opened = new Date(2026, 10, 26, 3, 1);
    const { scheduler, npm } = setup([{ updateCheck: { ...offer(beforeWindow), state: 'up-to-date' } }], true, opened);
    await scheduler.run(opened);
    expect(npm.checkInstalled).toHaveBeenCalledTimes(1);
  });

  it('does nothing when update checks are disabled', async () => {
    const { scheduler, npm, administration } = setup([{ updateCheck: offer(new Date(0)) }], false);
    await scheduler.run(inWindow);
    expect(npm.checkInstalled).not.toHaveBeenCalled();
    expect(administration.applyAutomaticUpdate).not.toHaveBeenCalled();
  });

  it('does not read the policy without installed npm plugins', async () => {
    const { scheduler, npm } = setup([]);
    await scheduler.run(inWindow);
    expect(npm.getUpdatePolicy).not.toHaveBeenCalled();
  });

  it('installs every offered update in the window and restarts once', async () => {
    const { scheduler, administration, pluginService } = setup([
      { updateCheck: offer(inWindow) },
      { updateCheck: { ...offer(inWindow), state: 'blocked', candidate: null } },
      { updateCheck: offer(inWindow, '2.3.4') },
    ]);
    await scheduler.run(inWindow);
    expect(administration.applyAutomaticUpdate.mock.calls.map(([name, version]) => [name, version])).toEqual([
      ['plugin-0', '1.1.0'],
      ['plugin-2', '2.3.4'],
    ]);
    expect(pluginService.requestRestart).toHaveBeenCalledTimes(1);

    await scheduler.run(inWindow);
    expect(administration.applyAutomaticUpdate).toHaveBeenCalledTimes(2);
  });

  it('lets the check made right before the install decide', async () => {
    const { scheduler, npm, administration, installed } = setup([{ updateCheck: offer(inWindow) }]);
    npm.checkInstalled.mockImplementation(async () => {
      // The admin switched the plugin off since the offer was made.
      installed[0].updateCheck = { ...offer(inWindow), state: 'blocked', candidate: null };
      return installed[0];
    });
    await scheduler.run(inWindow);
    expect(administration.applyAutomaticUpdate).not.toHaveBeenCalled();
  });

  it('records a failed install, goes on with the others and leaves that version alone for a day', async () => {
    const { scheduler, npm, administration, pluginService } = setup([
      { updateCheck: offer(inWindow) },
      { updateCheck: offer(inWindow) },
    ]);
    administration.applyAutomaticUpdate.mockRejectedValueOnce(new Error('Replacement blocked'));
    await scheduler.run(inWindow);
    expect(npm.recordAutoUpdateFailure).toHaveBeenCalledWith('plugin-0', '1.1.0', inWindow);
    expect(administration.applyAutomaticUpdate).toHaveBeenCalledTimes(2);
    expect(pluginService.requestRestart).toHaveBeenCalledTimes(1);
  });

  it('retries a failed version only after the pause, and a newer version at once', async () => {
    const failedAt = new Date(inWindow.getTime() - FAILED_UPDATE_RETRY_MS + 1000).toISOString();
    const held = setup([{ updateCheck: offer(inWindow), autoUpdateFailure: { version: '1.1.0', failedAt } }]);
    await held.scheduler.run(inWindow);
    expect(held.administration.applyAutomaticUpdate).not.toHaveBeenCalled();

    const newer = setup([{ updateCheck: offer(inWindow, '1.2.0'), autoUpdateFailure: { version: '1.1.0', failedAt } }]);
    await newer.scheduler.run(inWindow);
    expect(newer.administration.applyAutomaticUpdate).toHaveBeenCalledTimes(1);

    const later = new Date(inWindow.getTime() + 2000);
    const retried = setup(
      [{ updateCheck: offer(later), autoUpdateFailure: { version: '1.1.0', failedAt } }],
      true,
      later,
    );
    await retried.scheduler.run(later);
    expect(retried.administration.applyAutomaticUpdate).toHaveBeenCalledTimes(1);
  });

  it('does not restart when nothing was installed', async () => {
    const { scheduler, administration, pluginService } = setup([{ updateCheck: offer(inWindow) }]);
    administration.applyAutomaticUpdate.mockRejectedValue(new Error('nope'));
    await scheduler.run(inWindow);
    expect(pluginService.requestRestart).not.toHaveBeenCalled();
  });

  it('does not start a second pass while one is running', async () => {
    const { scheduler, npm } = setup([{}]);
    let finish: () => void;
    npm.getUpdatePolicy.mockImplementationOnce(
      () => new Promise((resolve) => (finish = () => resolve({ checksEnabled: false }))),
    );
    const first = scheduler.run(inWindow);
    await scheduler.run(inWindow);
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
