import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenderResponse } from './openscad.worker';

const parseBinaryStl = vi.fn(() => ({ positions: new Float32Array(), triangleCount: 0 }));
vi.mock('./stl', () => ({ parseBinaryStl }));

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
    // The id is a generation counter bumped on every label change (3 renders here), not a
    // count of posted messages — that is what makes an in-flight render stale immediately.
    expect(worker.postMessage).toHaveBeenCalledWith({ id: 3, label: 'ABC' });
  });

  it('ignores a stale response but still adopts the response matching the latest request', () => {
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

    // A stale response (superseded request id 1) must not update state...
    const staleResponse: RenderResponse = { id: 1, ok: true, body: new ArrayBuffer(0), letters: new ArrayBuffer(0) };
    act(() => {
      worker.onmessage?.({ data: staleResponse } as MessageEvent<RenderResponse>);
    });

    expect(result.current.status).not.toBe('ready');
    expect(result.current.result).toBeNull();
    expect(parseBinaryStl).not.toHaveBeenCalled();

    // ...but a response matching the current request id (2) must still be adopted. Without this
    // assertion, an implementation that drops every message (not just stale ones) would also
    // pass the assertions above.
    const currentBody = new ArrayBuffer(8);
    const currentLetters = new ArrayBuffer(4);
    const currentResponse: RenderResponse = { id: 2, ok: true, body: currentBody, letters: currentLetters };
    act(() => {
      worker.onmessage?.({ data: currentResponse } as MessageEvent<RenderResponse>);
    });

    expect(result.current.status).toBe('ready');
    expect(result.current.result?.bodyStl).toBe(currentBody);
    expect(result.current.result?.lettersStl).toBe(currentLetters);
    expect(parseBinaryStl).toHaveBeenCalledWith(currentBody);
    expect(parseBinaryStl).toHaveBeenCalledWith(currentLetters);
  });

  it('rejects an in-flight response once the label changes, before the next render is posted', () => {
    const { result, rerender } = renderHook(({ label }) => useCardRender(label), { initialProps: { label: 'A' } });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    const worker = FakeWorker.instances[0];
    const posted = worker.postMessage.mock.calls[0][0] as { id: number };

    // The user types again while that render is still running. The new render has NOT been
    // posted yet — it is still inside the 500ms debounce — so this is the window where a
    // response for the old label used to be accepted and offered for download under the new
    // label's filename.
    rerender({ label: 'AB' });

    const inFlightResponse: RenderResponse = {
      id: posted.id,
      ok: true,
      body: new ArrayBuffer(8),
      letters: new ArrayBuffer(4),
    };
    act(() => {
      worker.onmessage?.({ data: inFlightResponse } as MessageEvent<RenderResponse>);
    });

    expect(result.current.status).toBe('rendering');
    expect(result.current.result).toBeNull();
    expect(parseBinaryStl).not.toHaveBeenCalled();
  });

  it('clears a stale error as soon as a new render starts, not only once it succeeds', () => {
    const { result, rerender } = renderHook(({ label }) => useCardRender(label), { initialProps: { label: 'A' } });

    act(() => {
      vi.advanceTimersByTime(500);
    });
    // Request id 1 posted for label 'A'.

    const worker = FakeWorker.instances[0];
    const errorResponse: RenderResponse = { id: 1, ok: false, error: 'Label too long' };
    act(() => {
      worker.onmessage?.({ data: errorResponse } as MessageEvent<RenderResponse>);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Label too long');

    // Fixing the label starts a new render. The old error must disappear immediately — it
    // shouldn't linger through the whole next render, only to be cleared once that render
    // succeeds (or replaced only if it fails again).
    rerender({ label: 'A short label' });

    expect(result.current.status).toBe('rendering');
    expect(result.current.error).toBeNull();
  });
});
