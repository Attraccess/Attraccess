import '@testing-library/jest-dom/vitest';
import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
});
