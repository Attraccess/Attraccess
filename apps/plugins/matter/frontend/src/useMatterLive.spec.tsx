// @vitest-environment jsdom
import { PluginLiveUpdatesProvider } from '@attraccess/plugins-frontend-sdk';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeLiveClient } from './test-utils/liveClient';
import { LIVE_FALLBACK_POLL_MS, useMatterLive } from './useMatterLive';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useMatterLive fallback polling', () => {
  it('polls while the topic is unavailable, pauses while the browser tab is hidden and catches up when visible', async () => {
    vi.useFakeTimers();
    let visibility: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    const setVisibility = (next: DocumentVisibilityState) =>
      act(() => {
        visibility = next;
        document.dispatchEvent(new Event('visibilitychange'));
      });
    const live = createFakeLiveClient();
    const refetch = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <PluginLiveUpdatesProvider client={live.client}>{children}</PluginLiveUpdatesProvider>
    );
    const { result } = renderHook(() => useMatterLive({ topic: 'devices', enabled: true, refetch }), { wrapper });

    act(() => live.unavailable('devices'));
    expect(result.current.stale).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_FALLBACK_POLL_MS);
    });
    expect(refetch).toHaveBeenCalledTimes(1);

    setVisibility('hidden');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_FALLBACK_POLL_MS * 3);
    });
    expect(refetch).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    expect(refetch).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_FALLBACK_POLL_MS);
    });
    expect(refetch).toHaveBeenCalledTimes(3);

    // A signal means the topic works again: no more polling.
    act(() => live.push('devices'));
    expect(result.current.stale).toBe(false);
    const calls = refetch.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_FALLBACK_POLL_MS * 2);
    });
    expect(refetch).toHaveBeenCalledTimes(calls);
  });
});
