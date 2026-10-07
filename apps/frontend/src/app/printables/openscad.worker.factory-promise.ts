import type { CreateOpenSCAD } from './openscad.contracts';
import { OPENSCAD_BASE } from './openscad.state';
import { FONT_FILE } from './openscad.state';

export let factoryPromise: Promise<CreateOpenSCAD> | null = null;

export let modulePromise: Promise<WebAssembly.Module> | null = null;

export let assetsPromise: Promise<{ font: Uint8Array; config: string }> | null = null;

export /**
 * The vendored build is unmodified, so it compiles the 11 MB wasm on every instance and
 * every render needs two instances. Compiling once here and handing the result to each
 * instance via `instantiateWasm` — the one loading hook this build honours — keeps that
 * cost to the first render without patching any GPL-licensed file.
 */
function load(): Promise<[CreateOpenSCAD, WebAssembly.Module, { font: Uint8Array; config: string }]> {
  factoryPromise ??= import(/* @vite-ignore */ `${OPENSCAD_BASE}/openscad.wasm.js`).then(
    (module) => module.default as CreateOpenSCAD,
  );
  // eslint-disable-next-line no-restricted-syntax -- The worker loads bundled WebAssembly directly.
  modulePromise ??= WebAssembly.compileStreaming(fetch(`${OPENSCAD_BASE}/openscad.wasm`));
  assetsPromise ??= Promise.all([
    // eslint-disable-next-line no-restricted-syntax -- The worker loads bundled font assets directly.
    fetch(`${OPENSCAD_BASE}/fonts/${FONT_FILE}`).then((r) => r.arrayBuffer()),
    // eslint-disable-next-line no-restricted-syntax -- The worker loads bundled font assets directly.
    fetch(`${OPENSCAD_BASE}/fonts/fonts.conf`).then((r) => r.text()),
  ]).then(([font, config]) => ({ font: new Uint8Array(font), config }));

  return Promise.all([factoryPromise, modulePromise, assetsPromise]);
}
