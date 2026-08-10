import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenderResponse } from './openscad.worker';

const parseBinaryStl = vi.fn(() => ({ positions: new Float32Array(), triangleCount: 0 }));
vi.mock('./stl', () => ({ parseBinaryStl: (...args: unknown[]) => parseBinaryStl(...args) }));

/** Stands in for the real Worker so no wasm is loaded; just records what gets posted. */
class FakeWorker {
  static instances: FakeWorker[] = [];
  postMessage = vi.fn();
  terminate = vi.fn();
  onmessage: ((event: MessageEvent<RenderResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  constructor() {
    FakeWorker.instances.push(this);
  }
}

// Imported after the mock above so useCardRender picks up the stubbed ./stl.
const { useCardRender } = await import('./useCardRender');

describe('useCardRender', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWorker.instances = [];
    parseBinaryStl.mockClear();
    vi.stubGlobal('Worker', FakeWorker as unknown as typeof Worker);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('debounces rapid label changes into a single worker message', () => {
    const { rerender } = renderHook(({ label }) => useCardRender(label), { initialProps: { label: 'A' } });

    rerender({ label: 'AB' });
    rerender({ label: 'ABC' });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    const worker = FakeWorker.instances[0];
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).toHaveBeenCalledWith({ id: 1, label: 'ABC' });
  });

  it('ignores a response whose id no longer matches the latest request', () => {
    const { result, rerender } = renderHook(({ label }) => useCardRender(label), { initialProps: { label: 'A' } });

    act(() => {
      vi.advanceTimersByTime(500);
    });
    // Request id 1 posted for label 'A'.

    rerender({ label: 'B' });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    // Request id 2 posted for label 'B'; id 1 is now stale.

    const worker = FakeWorker.instances[0];
    expect(worker.postMessage).toHaveBeenCalledTimes(2);

    const staleResponse: RenderResponse = { id: 1, ok: true, body: new ArrayBuffer(0), letters: new ArrayBuffer(0) };
    act(() => {
      worker.onmessage?.({ data: staleResponse } as MessageEvent<RenderResponse>);
    });

    expect(result.current.status).not.toBe('ready');
    expect(result.current.result).toBeNull();
    expect(parseBinaryStl).not.toHaveBeenCalled();
  });
});
