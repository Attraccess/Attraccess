import type { PreStartContext, SessionEndContext } from '@attraccess/plugins-backend-sdk';
import type { GlobalSettingsService } from '../settings/global-settings.service';
import type { ResourceSettingsService } from '../settings/resource-settings.service';
import { ReaderUiService } from '../reader-ui/reader-ui.service';
import { PreStartService } from './pre-start.service';
import {
  HOOK_BUDGET_MS,
  preStartHook,
  publishHookServices,
  readerUiProvider,
  resolveHookServices,
  sessionEndHook,
  waitUntil,
} from './runtime';
import { SessionEndService } from './session-end.service';

const ctx = { resourceId: 1, userId: 2, confirmedStepKeys: [] } as unknown as PreStartContext;

/** Hook services whose settings cache never warms up (a database that hangs during boot). */
function coldServices() {
  const settings = {
    isWarm: false,
    whenReady: () => new Promise<void>(() => undefined),
  } as unknown as ResourceSettingsService;
  const unused = {} as never;
  return {
    preStart: new PreStartService(settings, unused, unused, unused, unused, unused, () => new Date()),
    sessionEnd: new SessionEndService(settings, {} as GlobalSettingsService, unused, unused, unused, () => new Date()),
    readerUi: new ReaderUiService(settings, {} as GlobalSettingsService, unused, unused, unused, () => new Date()),
  };
}

describe('hook runtime', () => {
  afterEach(() => {
    publishHookServices(null);
    jest.useRealTimers();
  });

  it('fails (host failure policy applies) when the module never becomes ready', async () => {
    await expect(resolveHookServices(Date.now() + 20)).rejects.toThrow('not ready');
  });

  it('waits for a module that is still booting', async () => {
    const pending = preStartHook(ctx);
    setTimeout(
      () =>
        publishHookServices({
          preStart: { evaluate: async () => ({ decision: 'allow' }), evaluateStartBlocked: async () => null },
          sessionEnd: { evaluate: async () => ({ decision: 'none' }) },
          readerUi: { getSlotContributions: async () => [] },
        }),
      10,
    );
    await expect(pending).resolves.toEqual({ decision: 'allow' });
    await expect(sessionEndHook({} as never)).resolves.toEqual({ decision: 'none' });
  });

  it('the reader UI provider waits for the module, then delegates with the shared deadline', async () => {
    const getSlotContributions = jest.fn(async () => []);
    const pending = readerUiProvider.getSlotContributions({ resourceId: 1 } as never);
    setTimeout(
      () =>
        publishHookServices({
          preStart: { evaluate: async () => ({ decision: 'allow' }) },
          sessionEnd: { evaluate: async () => ({ decision: 'none' }) },
          readerUi: { getSlotContributions },
        }),
      10,
    );
    await expect(pending).resolves.toEqual([]);
    expect(getSlotContributions).toHaveBeenCalledWith({ resourceId: 1 }, expect.any(Number));
  });

  it('withdraws the services on shutdown', async () => {
    publishHookServices({
      preStart: { evaluate: async () => ({ decision: 'allow' }), evaluateStartBlocked: async () => null },
      sessionEnd: { evaluate: async () => ({ decision: 'none' }) },
      readerUi: { getSlotContributions: async () => [] },
    });
    publishHookServices(null);
    await expect(resolveHookServices(Date.now() + 10)).rejects.toThrow();
  });

  it('keeps the whole wait well under the host timeout of 1.5 s', () => {
    expect(HOOK_BUDGET_MS).toBeLessThanOrEqual(1200);
  });

  it.each([
    ['preStartHook', () => preStartHook(ctx)],
    ['sessionEndHook', () => sessionEndHook({ resourceId: 1, userId: 2 } as SessionEndContext)],
  ])('%s shares one budget between module boot and settings warm-up', async (_name, call) => {
    jest.useFakeTimers();
    const failed = jest.fn();
    void call().catch(failed);
    // the module needs most of the budget to boot; the cache wait only gets the rest
    setTimeout(() => publishHookServices(coldServices()), 1000);
    await jest.advanceTimersByTimeAsync(HOOK_BUDGET_MS - 1);
    expect(failed).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(failed).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('not loaded') }));
  });

  it('bounds the session-end wait for the settings cache when called directly', async () => {
    jest.useFakeTimers();
    const failed = jest.fn();
    void coldServices()
      .sessionEnd.evaluate({ resourceId: 1, userId: 2 } as SessionEndContext)
      .catch(failed);
    await jest.advanceTimersByTimeAsync(HOOK_BUDGET_MS);
    expect(failed).toHaveBeenCalled();
  });

  it('waitUntil resolves with the work when it finishes in time', async () => {
    await expect(waitUntil(Promise.resolve(5), Date.now() + 50, 'late')).resolves.toBe(5);
    await expect(waitUntil(new Promise(() => undefined), Date.now() + 5, 'late')).rejects.toThrow('late');
  });
});
