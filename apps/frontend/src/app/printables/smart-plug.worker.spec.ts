import { describe, expect, it, vi } from 'vitest';
import { createPlugMessageHandler, type PlugRenderResponse } from './smart-plug.worker';
import { DEFAULT_PLUG_CONFIG } from './smartPlugConfig';

/** Lets pending timers run, including the queue's yield before each task. */
const flush = async () => {
  for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

/** A stand-in for `renderScad` whose renders finish only when released, in order. */
function controllableRender() {
  const started: string[] = [];
  const pending: Array<() => void> = [];
  const render = vi.fn((_source: string, defines: Record<string, string | number>) => {
    started.push(`${defines.PART}:${defines.CORD_OPEN_D}`);
    return new Promise<ArrayBuffer>((resolve) => pending.push(() => resolve(new ArrayBuffer(8))));
  });
  const releaseNext = async () => {
    pending.shift()?.();
    await flush();
  };
  return { render, started, releaseNext };
}

describe('createPlugMessageHandler', () => {
  it('renders body then cover and posts both', async () => {
    const posted: PlugRenderResponse[] = [];
    const { render, started, releaseNext } = controllableRender();
    const handle = createPlugMessageHandler((response) => posted.push(response), render);

    handle({ id: 1, config: DEFAULT_PLUG_CONFIG });
    await flush();
    await releaseNext();
    await releaseNext();

    expect(started).toEqual(['"body":12', '"cover":12']);
    expect(posted).toEqual([{ id: 1, ok: true, body: expect.any(ArrayBuffer), cover: expect.any(ArrayBuffer) }]);
  });

  it('serialises renders and skips queued requests a newer one superseded', async () => {
    const posted: PlugRenderResponse[] = [];
    const { render, started, releaseNext } = controllableRender();
    const handle = createPlugMessageHandler((response) => posted.push(response), render);

    handle({ id: 1, config: { ...DEFAULT_PLUG_CONFIG, cordOpeningDiameter: 6 } });
    await flush();
    // Two more arrive while request 1 renders its body; only the newest is worth running.
    handle({ id: 2, config: { ...DEFAULT_PLUG_CONFIG, cordOpeningDiameter: 7 } });
    handle({ id: 3, config: { ...DEFAULT_PLUG_CONFIG, cordOpeningDiameter: 8 } });
    expect(started).toEqual(['"body":6']);

    await releaseNext(); // body of 1; its cover is skipped because 1 is superseded
    await releaseNext(); // body of 3
    await releaseNext(); // cover of 3

    expect(started).toEqual(['"body":6', '"body":8', '"cover":8']);
    expect(posted.map((response) => response.id)).toEqual([3]);
  });

  it('skips the cover when a newer request arrived while the body rendered', async () => {
    const posted: PlugRenderResponse[] = [];
    const { render, started, releaseNext } = controllableRender();
    const handle = createPlugMessageHandler((response) => posted.push(response), render);

    handle({ id: 1, config: { ...DEFAULT_PLUG_CONFIG, cordOpeningDiameter: 6 } });
    await flush();
    // Posted while OpenSCAD blocked the thread, so it is only delivered once the body is done.
    setTimeout(() => handle({ id: 2, config: { ...DEFAULT_PLUG_CONFIG, cordOpeningDiameter: 7 } }));
    await releaseNext(); // body of 1
    await releaseNext(); // body of 2
    await releaseNext(); // cover of 2

    expect(started).toEqual(['"body":6', '"body":7', '"cover":7']);
    expect(posted.map((response) => response.id)).toEqual([2]);
  });

  it('reports a failure of the cover after the body rendered', async () => {
    const posted: PlugRenderResponse[] = [];
    const render = vi.fn(async (_source: string, defines: Record<string, string | number>) => {
      if (defines.PART === '"cover"') throw new Error('cover failed');
      return new ArrayBuffer(8);
    });
    const handle = createPlugMessageHandler((response) => posted.push(response), render);

    handle({ id: 1, config: DEFAULT_PLUG_CONFIG });
    await flush();

    expect(posted).toEqual([{ id: 1, ok: false, error: 'cover failed' }]);
  });

  it('reports a failed render', async () => {
    const posted: PlugRenderResponse[] = [];
    const handle = createPlugMessageHandler(
      (response) => posted.push(response),
      () => Promise.reject(new Error('Cable opening must be 5-12 mm.')),
    );

    handle({ id: 1, config: DEFAULT_PLUG_CONFIG });
    await flush();

    expect(posted).toEqual([{ id: 1, ok: false, error: 'Cable opening must be 5-12 mm.' }]);
  });
});
