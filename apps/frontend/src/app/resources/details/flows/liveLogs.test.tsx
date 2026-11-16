import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResourceFlowLog } from '@attraccess/react-query-client';
import { useLiveLogs } from './liveLogs';

const state = vi.hoisted(() => ({
  messages: [] as Array<{ data: string }>,
  streamEnded: undefined as undefined | (() => void),
  liveUpdates: vi.fn(),
}));

vi.mock('fetch-event-stream', () => ({
  events: async function* (_response: unknown, signal: AbortSignal) {
    for (const message of state.messages) yield message;
    // Keeps the stream open until the hook aborts it, like a real SSE connection.
    await new Promise<void>((resolve) => {
      state.streamEnded = resolve;
      signal.addEventListener('abort', () => resolve());
    });
  },
}));
vi.mock('../../../../api', () => ({ getBaseUrl: () => 'http://api.test' }));
vi.mock('../../../../utils/live-updates', () => ({
  useLiveUpdates: (options: unknown) => {
    state.liveUpdates(options);
    return { abort: vi.fn(), owner: null };
  },
}));

const log = (id: number): ResourceFlowLog => ({ id, flowRunId: `run-${id}`, type: 'flow.start' }) as ResourceFlowLog;

describe('useLiveLogs for a global flow', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    state.messages = [];
    state.liveUpdates.mockClear();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('streams the logs of the flow from its own endpoint, skipping keepalives and malformed frames', async () => {
    state.messages = [
      { data: JSON.stringify({ keepalive: true }) },
      { data: '{ not json' },
      { data: JSON.stringify(log(1)) },
      { data: JSON.stringify(log(2)) },
    ];
    const onUpdate = vi.fn();

    const { result } = renderHook(() => useLiveLogs({ owner: { kind: 'global', flowId: 5 }, onUpdate }));

    await waitFor(() => expect(result.current.liveLogs.map((entry) => entry.id)).toEqual([1, 2]));
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/flows/5/logs/live',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(onUpdate).toHaveBeenCalledTimes(2);
    // A global flow must not subscribe to the shared live-update topic of a resource.
    expect(state.liveUpdates).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it('keeps the log view empty when the stream cannot be opened', async () => {
    fetchMock.mockResolvedValue({ ok: false });

    const { result } = renderHook(() => useLiveLogs({ owner: { kind: 'global', flowId: 5 }, onUpdate: vi.fn() }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(result.current.liveLogs).toEqual([]);
  });

  it('survives a dropped connection', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useLiveLogs({ owner: { kind: 'global', flowId: 5 }, onUpdate: vi.fn() }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(result.current.liveLogs).toEqual([]);
  });

  it('aborts the stream when the editor is left', async () => {
    const { unmount } = renderHook(() => useLiveLogs({ owner: { kind: 'global', flowId: 5 }, onUpdate: vi.fn() }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;

    expect(signal.aborted).toBe(false);
    act(() => unmount());
    expect(signal.aborted).toBe(true);
  });

  it('does not open the global stream for a resource flow', () => {
    renderHook(() => useLiveLogs({ owner: { kind: 'resource', resourceId: 3 }, onUpdate: vi.fn() }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.liveUpdates).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'flow-logs', resourceId: 3, enabled: true }),
    );
  });
});
