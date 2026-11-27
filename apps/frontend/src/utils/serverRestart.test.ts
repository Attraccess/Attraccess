import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginSystemStatusDto } from '@attraccess/react-query-client';
import { restartServerAndReload, SERVER_RESTART_TIMEOUT_MS, waitForServerRestart } from './serverRestart';

const hoisted = vi.hoisted(() => ({ reloadPage: vi.fn() }));
vi.mock('./reloadPage', () => ({ reloadPage: hoisted.reloadPage }));

const status = (instanceId: string): PluginSystemStatusDto => ({ disabled: false, instanceId, restartRequired: false });

describe('server restart', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('reads the instance before the restart, waits through downtime for a new one and reloads once', async () => {
    const getStatus = vi
      .fn<() => Promise<PluginSystemStatusDto | undefined>>()
      .mockResolvedValueOnce(status('old'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(status('old'))
      .mockResolvedValue(status('new'));
    const trigger = vi.fn().mockResolvedValue({ ok: true });
    const onTriggered = vi.fn();

    const done = restartServerAndReload(getStatus, trigger, onTriggered);
    await vi.runAllTimersAsync();
    await done;

    expect(getStatus.mock.invocationCallOrder[0]).toBeLessThan(trigger.mock.invocationCallOrder[0]);
    expect(onTriggered).toHaveBeenCalledOnce();
    expect(hoisted.reloadPage).toHaveBeenCalledOnce();
  });

  it('does not wait or reload when the restart request fails', async () => {
    const getStatus = vi.fn().mockResolvedValue(status('old'));

    await expect(restartServerAndReload(getStatus, () => Promise.reject(new Error('403')))).rejects.toThrow('403');

    expect(getStatus).toHaveBeenCalledOnce();
    expect(hoisted.reloadPage).not.toHaveBeenCalled();
  });

  it('gives up when no new instance answers before the deadline', async () => {
    const getStatus = vi.fn().mockResolvedValue(status('old'));

    const waiting = expect(waitForServerRestart('old', getStatus)).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(SERVER_RESTART_TIMEOUT_MS + 1_000);
    await waiting;
  });
});
