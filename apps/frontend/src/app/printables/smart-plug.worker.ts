/// <reference lib="webworker" />
import scadSource from './smart-plug-cover.scad?raw';
import type { PlugCable, PlugDevice } from './usePlugRender';
import { createSerialQueue } from './serialQueue';

export interface PlugRenderRequest {
  id: number;
  device: PlugDevice;
  cable: PlugCable;
  deviceExtraDiameter: number;
  cordOpeningDiameter: number;
  heightAbovePlug: number;
  cableCutoutHeight: number;
}
export type PlugRenderResponse =
  { id: number; ok: true; body: ArrayBuffer; cover: ArrayBuffer } | { id: number; ok: false; error: string };

interface Instance {
  callMain(args: string[]): number;
  FS: {
    mkdir(path: string): void;
    writeFile(path: string, data: string | ArrayBufferView): void;
    readFile(path: string): Uint8Array;
  };
  ENV: Record<string, string>;
}
type Factory = (options: Record<string, unknown>) => Promise<Instance>;
const BASE = '/openscad';
let assets: Promise<[Factory, WebAssembly.Module, Uint8Array, string]> | null = null;

function load() {
  assets ??= Promise.all([
    import(/* @vite-ignore */ `${BASE}/openscad.wasm.js`).then((m) => m.default as Factory),
    WebAssembly.compileStreaming(fetch(`${BASE}/openscad.wasm`)),
    fetch(`${BASE}/fonts/Sansation_Regular.ttf`)
      .then((r) => r.arrayBuffer())
      .then((b) => new Uint8Array(b)),
    fetch(`${BASE}/fonts/fonts.conf`).then((r) => r.text()),
  ]);
  return assets;
}

async function render(
  part: 'body' | 'cover',
  device: PlugDevice,
  cable: PlugCable,
  deviceExtraDiameter: number,
  cordOpeningDiameter: number,
  heightAbovePlug: number,
  cableCutoutHeight: number,
) {
  const [factory, wasm, font, config] = await load();
  const errors: string[] = [];
  const instance = await factory({
    noInitialRun: true,
    print: () => undefined,
    printErr: (text: string) => errors.push(text),
    instantiateWasm: (imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void) => {
      WebAssembly.instantiate(wasm, imports).then(done);
      return {};
    },
  });
  instance.FS.mkdir('/fonts');
  instance.FS.writeFile('/fonts/fonts.conf', config);
  instance.FS.writeFile('/fonts/Sansation_Regular.ttf', font);
  instance.ENV.FONTCONFIG_FILE = '/fonts/fonts.conf';
  instance.FS.writeFile('/cover.scad', scadSource);
  try {
    instance.callMain([
      '/cover.scad',
      '--enable',
      'textmetrics',
      '--backend',
      'Manifold',
      '--export-format',
      'binstl',
      '-D',
      `PART=${JSON.stringify(part)}`,
      '-D',
      `DEVICE=${JSON.stringify(device)}`,
      '-D',
      `CABLE=${JSON.stringify(cable)}`,
      '-D',
      `DEVICE_EXTRA_D=${deviceExtraDiameter}`,
      '-D',
      `CORD_OPEN_D=${cordOpeningDiameter}`,
      '-D',
      `HEIGHT_ABOVE_PLUG=${heightAbovePlug}`,
      '-D',
      `CABLE_CUT_H=${cableCutoutHeight}`,
      '-o',
      '/out.stl',
    ]);
  } catch {
    /* OpenSCAD exits its Emscripten runtime after rendering. */
  }
  try {
    return new Uint8Array(instance.FS.readFile('/out.stl')).buffer;
  } catch {
    throw new Error(errors.join('\n') || 'Could not generate the model.');
  }
}

const submit = createSerialQueue();

self.onmessage = (event: MessageEvent<PlugRenderRequest>) => {
  const { id, device, cable, deviceExtraDiameter, cordOpeningDiameter, heightAbovePlug, cableCutoutHeight } =
    event.data;
  submit(id, async () => {
    try {
      const [body, cover] = await Promise.all([
        render('body', device, cable, deviceExtraDiameter, cordOpeningDiameter, heightAbovePlug, cableCutoutHeight),
        render('cover', device, cable, deviceExtraDiameter, cordOpeningDiameter, heightAbovePlug, cableCutoutHeight),
      ]);
      (self as unknown as Worker).postMessage({ id, ok: true, body, cover } satisfies PlugRenderResponse, [
        body,
        cover,
      ]);
    } catch (error) {
      (self as unknown as Worker).postMessage({
        id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies PlugRenderResponse);
    }
  });
};
