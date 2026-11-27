/// <reference lib="webworker" />

// Shared by every printables worker: loading the vendored OpenSCAD build, running one render,
// serialising renders and turning OpenSCAD's stderr into an error. Each model's worker only adds
// its .scad source and its message handler.

import { NO_OUTPUT_ERROR } from './errors';

export interface OpenScadInstance {
  callMain(args: string[]): number;
  FS: {
    mkdir(path: string): void;
    writeFile(path: string, data: string | ArrayBufferView): void;
    readFile(path: string): Uint8Array;
  };
  ENV: Record<string, string>;
}

export type CreateOpenSCAD = (options: {
  noInitialRun?: boolean;
  print?: (text: string) => void;
  printErr?: (text: string) => void;
  instantiateWasm?: (
    imports: WebAssembly.Imports,
    done: (instance: WebAssembly.Instance) => void,
  ) => Record<string, never>;
}) => Promise<OpenScadInstance>;

export interface RenderRequest {
  id: number;
  label: string;
}

export type RenderResponse =
  { id: number; ok: true; body: ArrayBuffer; letters: ArrayBuffer } | { id: number; ok: false; error: string };

export let factoryPromise: Promise<CreateOpenSCAD> | null = null;

export let modulePromise: Promise<WebAssembly.Module> | null = null;

export let assetsPromise: Promise<{ font: Uint8Array; config: string }> | null = null;

/**
 * The vendored build is unmodified, so it compiles the 11 MB wasm on every instance and
 * every render needs two instances. Compiling once here and handing the result to each
 * instance via `instantiateWasm` — the one loading hook this build honours — keeps that
 * cost to the first render without patching any GPL-licensed file.
 */
export function load(): Promise<[CreateOpenSCAD, WebAssembly.Module, { font: Uint8Array; config: string }]> {
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

export const FONT_FILE = 'Sansation_Regular.ttf';

// OpenSCAD is GPL-licensed and deliberately kept at arm's length: it is fetched as an
// unbundled static asset and driven through argv + a virtual filesystem, exactly like the
// CLI. See apps/frontend/public/openscad/NOTICE.md. Do not import it into the main bundle.
export const OPENSCAD_BASE = '/openscad';

/**
 * OpenSCAD reports assert() failures on stderr; surface the message rather than a generic
 * failure. A compile-time assert line looks like:
 *   Assertion '<condition>' failed: "<message>" in file /card.scad, line 69
 * `<message>` is itself an OpenSCAD string (built with `str(...)` in rfid-keychain-card.scad) and
 * may contain embedded, unescaped quotes of its own — e.g. `Label too long: "TOO LONG" does not
 * fit...`. So the outer quotes wrapping `<message>` can't be found by looking for *any* quote;
 * anchor on the ` in file ` marker that OpenSCAD always appends after the location, and take
 * everything back to the first quote after `failed:` (greedy `.*` backtracks to the last quote
 * before that marker, i.e. the real outer closing quote).
 */
export function assertionMessage(errors: string[]): string | null {
  const line = errors.find((e) => /Assertion .* failed/.test(e));
  if (!line) return null;
  const withLocation = /failed:\s*"(.*)"\s+in file\b/.exec(line);
  if (withLocation) return withLocation[1];
  // Fallback for a stderr line without the "in file ..." suffix (e.g. a differently-shaped
  // assert message): best effort, quotes stripped only if present at both ends.
  const quoted = /failed:\s*"?(.*?)"?\s*$/.exec(line);
  return quoted?.[1] ?? line;
}

/**
 * Serialises submitted work so at most one task runs at a time, and drops any task already
 * superseded by a later submission before its turn comes.
 *
 * Renders need this because each one builds two Emscripten instances. The compiled wasm module
 * is shared via the vendored loader's cache, but each instance still gets its own linear
 * memory, and the Manifold booleans in the .scad are where the allocation actually happens.
 * The main thread's 500 ms debounce does not prevent overlap — it only bounds how fast requests
 * arrive, and a render takes longer than that on anything but a fast desktop — so without a
 * queue, requests stack up unboundedly with nothing tearing down the superseded ones.
 *
 * Note the supersede check applies to any task that has not started yet, including the most
 * recently submitted one if a newer submission lands before the microtask queue drains. That
 * is intended: only the newest request's result is ever consumed.
 *
 * A running task receives `isCurrent`, so a multi-part render can stop between parts once a
 * newer submission has made its result useless.
 */
export function createSerialQueue(): (id: number, task: (isCurrent: () => boolean) => Promise<void>) => void {
  let tail: Promise<void> = Promise.resolve();
  let latestId = 0;

  return (id, task) => {
    latestId = id;
    const isCurrent = () => id === latestId;
    tail = tail
      .then(() => (isCurrent() ? task(isCurrent) : undefined))
      // A rejection must not poison the chain for every later submission.
      .catch(() => undefined);
  };
}

/**
 * Reason to report when a part rendered with no /out.stl file. If OpenSCAD raised its own
 * assert() (e.g. "Label too long: ..."), that message is genuinely useful and specific, so it
 * is surfaced as-is — it comes from OpenSCAD in English and can't be translated, which is
 * acceptable. Otherwise the render simply produced nothing (for example a label made entirely
 * of glyphs missing from the vendored font); that case has no useful detail to report, so a
 * stable, translatable reason code is returned instead of prose — and, importantly, instead of
 * naming the internal OpenSCAD part ("body"/"letters") to the user.
 */
export function renderErrorReason(errors: string[]): string {
  return assertionMessage(errors) ?? NO_OUTPUT_ERROR;
}

/** OpenSCAD `-D` values. Strings must already be OpenSCAD literals (e.g. `JSON.stringify(text)`). */
export type ScadDefines = Record<string, string | number>;

/**
 * Renders one part of `source` to a binary STL. A fresh instance per call is required:
 * Emscripten tears the runtime down after callMain, so a second call on the same instance
 * throws. Instances stay cheap because `load()` compiles the wasm once and every instance
 * reuses that module.
 */
export async function renderScad(source: string, defines: ScadDefines): Promise<ArrayBuffer> {
  const [factory, wasmModule, assets] = await load();
  const errors: string[] = [];
  // Silence stdout: without an explicit `print`, Emscripten's default writes OpenSCAD's
  // normal ECHO/status chatter to the browser console.
  const instance = await factory({
    noInitialRun: true,
    printErr: (t) => errors.push(t),
    print: () => undefined,
    instantiateWasm: (imports, done) => {
      WebAssembly.instantiate(wasmModule, imports).then(done);
      return {};
    },
  });

  instance.FS.mkdir('/fonts');
  instance.FS.writeFile('/fonts/fonts.conf', assets.config);
  instance.FS.writeFile(`/fonts/${FONT_FILE}`, assets.font);
  instance.ENV.FONTCONFIG_FILE = '/fonts/fonts.conf';
  instance.FS.writeFile('/model.scad', source);

  try {
    instance.callMain([
      '/model.scad',
      '--enable',
      'textmetrics',
      '--backend',
      'Manifold',
      '--export-format',
      'binstl',
      ...Object.entries(defines).flatMap(([name, value]) => ['-D', `${name}=${value}`]),
      '-o',
      '/out.stl',
    ]);
  } catch {
    // Expected: callMain exits the runtime.
  }

  let data: Uint8Array;
  try {
    data = instance.FS.readFile('/out.stl');
  } catch {
    throw new Error(renderErrorReason(errors));
  }

  // Copy out of the wasm heap before the instance is collected.
  return new Uint8Array(data).buffer;
}

/** The worker's reply for a failed render. */
export function errorResponse(id: number, error: unknown): { id: number; ok: false; error: string } {
  return { id, ok: false, error: error instanceof Error ? error.message : String(error) };
}
