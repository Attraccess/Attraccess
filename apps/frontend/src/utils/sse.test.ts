import '@testing-library/jest-dom/vitest';
import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { events } from 'fetch-event-stream';
import { useSSE } from './sse';

vi.mock('fetch-event-stream', () => ({
  events: vi.fn().mockReturnValue({
    [Symbol.asyncIterator]: () => ({ next: () => Promise.resolve({ done: true, value: undefined }) }),
  }),
}));

vi.mock('../api', () => ({
  getBaseUrl: () => 'http://localhost:3000',
}));

describe('useSSE', () => {
  let abortSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    abortSpy = vi.spyOn(AbortController.prototype, 'abort');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    vi.mocked(events).mockReturnValue({
      [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => undefined) }),
    });
  });

  afterEach(() => {
    abortSpy.mockRestore();
  });

  it('aborts the connection when the component unmounts', async () => {
    const { unmount } = renderHook(() =>
      useSSE({ path: '/test', onUpdate: vi.fn(), enabled: true })
    );

    // Let connect() advance past the fetch await
    await act(async () => {
      await Promise.resolve();
    });

    unmount();

    expect(abortSpy).toHaveBeenCalled();
  });

  it('does not connect when disabled', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() => useSSE({ path: '/test', onUpdate: vi.fn(), enabled: false }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shares one connection between subscribers to the same stream', async () => {
    const { unmount } = renderHook(() => {
      useSSE({ path: '/resources/1/events', onUpdate: vi.fn(), enabled: true });
      useSSE({ path: '/resources/1/events', onUpdate: vi.fn(), enabled: true });
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledTimes(1);

    unmount();

    expect(abortSpy).toHaveBeenCalledTimes(1);
  });

  it('creates a new connection after a completed stream', async () => {
    vi.mocked(events).mockReturnValue({
      [Symbol.asyncIterator]: () => ({ next: () => Promise.resolve({ done: true, value: undefined }) }),
    });

    const first = renderHook(() => useSSE({ path: '/resources/1/events', onUpdate: vi.fn(), enabled: true }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const second = renderHook(() => useSSE({ path: '/resources/1/events', onUpdate: vi.fn(), enabled: true }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledTimes(2);

    first.unmount();
    second.unmount();
  });

  it('does not abort a replacement connection when a stale subscriber unmounts', async () => {
    const first = renderHook(() => useSSE({ path: '/resources/1/events', onUpdate: vi.fn(), enabled: true }));

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      first.result.current.abort();
    });

    const second = renderHook(() => useSSE({ path: '/resources/1/events', onUpdate: vi.fn(), enabled: true }));

    await act(async () => {
      await Promise.resolve();
    });

    first.unmount();

    expect(abortSpy).toHaveBeenCalledTimes(1);

    second.unmount();

    expect(abortSpy).toHaveBeenCalledTimes(2);
  });

  it('delivers replacement stream events to existing subscribers', async () => {
    const firstSubscriber = vi.fn();
    const secondSubscriber = vi.fn();
    vi.mocked(events)
      .mockReturnValueOnce({
        [Symbol.asyncIterator]: () => ({ next: () => Promise.resolve({ done: true, value: undefined }) }),
      })
      .mockReturnValueOnce({
        async *[Symbol.asyncIterator]() {
          yield { data: JSON.stringify({ resourceId: 1 }) };
        },
      });

    const first = renderHook(() => useSSE({ path: '/resources/1/events', onUpdate: firstSubscriber, enabled: true }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const second = renderHook(() =>
      useSSE({ path: '/resources/1/events', onUpdate: secondSubscriber, enabled: true }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(firstSubscriber).toHaveBeenCalledWith({ resourceId: 1 });
    expect(secondSubscriber).toHaveBeenCalledWith({ resourceId: 1 });

    first.unmount();
    second.unmount();
  });

  it('delivers events to remaining subscribers when one throws', async () => {
    const onUpdate = vi.fn();
    const subscriberError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(events).mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield { data: JSON.stringify({ resourceId: 1 }) };
      },
    });

    const { unmount } = renderHook(() => {
      useSSE({
        path: '/resources/1/events',
        onUpdate: () => {
          throw new Error('subscriber failed');
        },
        enabled: true,
      });
      useSSE({ path: '/resources/1/events', onUpdate, enabled: true });
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onUpdate).toHaveBeenCalledWith({ resourceId: 1 });
    expect(subscriberError).toHaveBeenCalledWith('[SSE] Subscriber error:', expect.any(Error));

    unmount();
  });
});
