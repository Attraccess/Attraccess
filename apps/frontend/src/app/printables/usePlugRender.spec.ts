import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PLUG_CONFIG, type PlugConfig } from './smartPlugConfig';

vi.mock('./stl', () => ({ parseBinaryStl: vi.fn(() => ({ positions: new Float32Array(), triangleCount: 0 })) }));

/** Stands in for the real Worker so no wasm is loaded; just records what gets posted. */
class FakeWorker {
  static instances: FakeWorker[] = [];
  postMessage = vi.fn();
  terminate = vi.fn();
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  constructor() {
    FakeWorker.instances.push(this);
  }
}

const { usePlugRender } = await import('./usePlugRender');

describe('usePlugRender', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker as unknown as typeof Worker);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('debounces rapid edits into one request for the latest settings', () => {
    const { rerender } = renderHook(({ config }) => usePlugRender(config), {
      initialProps: { config: DEFAULT_PLUG_CONFIG },
    });
    rerender({ config: { ...DEFAULT_PLUG_CONFIG, cordOpeningDiameter: 13 } });
    rerender({ config: { ...DEFAULT_PLUG_CONFIG, cordOpeningDiameter: 14 } });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    const worker = FakeWorker.instances[0];
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).toHaveBeenCalledWith({
      id: 3,
      config: { ...DEFAULT_PLUG_CONFIG, cordOpeningDiameter: 14 },
    });
  });

  it('neither re-renders nor sends hidden angled heights for a straight cable', () => {
    const { rerender, result } = renderHook(({ config }: { config: PlugConfig }) => usePlugRender(config), {
      initialProps: { config: DEFAULT_PLUG_CONFIG },
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    const worker = FakeWorker.instances[0];
    act(() => {
      worker.onmessage?.({
        data: { id: 1, ok: true, body: new ArrayBuffer(0), cover: new ArrayBuffer(0) },
      } as MessageEvent);
    });
    expect(result.current.status).toBe('ready');

    rerender({ config: { ...DEFAULT_PLUG_CONFIG, heightAbovePlug: 30, cableCutoutHeight: 35 } });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).toHaveBeenCalledWith({ id: 1, config: DEFAULT_PLUG_CONFIG });
    expect(result.current.status).toBe('ready');
  });

  it('adopts only the response to the newest request', () => {
    const { rerender, result } = renderHook(({ config }: { config: PlugConfig }) => usePlugRender(config), {
      initialProps: { config: DEFAULT_PLUG_CONFIG },
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    rerender({ config: { ...DEFAULT_PLUG_CONFIG, device: 'shelly_legacy' } });
    const worker = FakeWorker.instances[0];
    act(() => {
      worker.onmessage?.({
        data: { id: 1, ok: true, body: new ArrayBuffer(0), cover: new ArrayBuffer(0) },
      } as MessageEvent);
    });
    expect(result.current.result).toBeNull();
    expect(result.current.status).toBe('rendering');

    act(() => {
      worker.onmessage?.({ data: { id: 2, ok: false, error: 'boom' } } as MessageEvent);
    });
    expect(result.current).toMatchObject({ status: 'error', error: 'boom' });
  });
});
