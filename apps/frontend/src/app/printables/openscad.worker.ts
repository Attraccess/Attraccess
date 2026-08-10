/// <reference lib="webworker" />
import scadSource from './nfc-keychain-card.scad?raw';
import { NO_OUTPUT_ERROR } from './errors';

// OpenSCAD is GPL-licensed and deliberately kept at arm's length: it is fetched as an
// unbundled static asset and driven through argv + a virtual filesystem, exactly like the
// CLI. See apps/frontend/public/openscad/NOTICE.md. Do not import it into the main bundle.
const OPENSCAD_BASE = '/openscad';
const FONT_FILE = 'LiberationSans-Regular.ttf';

export interface RenderRequest {
  id: number;
  label: string;
}

export type RenderResponse =
  | { id: number; ok: true; body: ArrayBuffer; letters: ArrayBuffer }
  | { id: number; ok: false; error: string };

interface OpenScadInstance {
  callMain(args: string[]): number;
  FS: {
    mkdir(path: string): void;
    writeFile(path: string, data: string | ArrayBufferView): void;
    readFile(path: string): Uint8Array;
  };
  ENV: Record<string, string>;
}

type CreateOpenSCAD = (options: {
  print?: (text: string) => void;
  printErr?: (text: string) => void;
}) => Promise<{ getInstance(): Promise<OpenScadInstance> }>;

let createOpenSCAD: CreateOpenSCAD | null = null;
let fontData: Uint8Array | null = null;
let fontConfig: string | null = null;

async function load(): Promise<CreateOpenSCAD> {
  if (!createOpenSCAD) {
    const module = await import(/* @vite-ignore */ `${OPENSCAD_BASE}/openscad.js`);
    createOpenSCAD = module.createOpenSCAD as CreateOpenSCAD;
  }
  if (!fontData) {
    const [font, config] = await Promise.all([
      fetch(`${OPENSCAD_BASE}/fonts/${FONT_FILE}`).then((r) => r.arrayBuffer()),
      fetch(`${OPENSCAD_BASE}/fonts/fonts.conf`).then((r) => r.text()),
    ]);
    fontData = new Uint8Array(font);
    fontConfig = config;
  }
  return createOpenSCAD;
}

/**
 * Renders one part. A fresh instance per call is required: Emscripten tears the runtime
 * down after callMain, so a second call on the same instance throws. Instances are cheap
 * (~20 ms) because the compiled wasm module is cached by the vendored loader.
 */
async function renderPart(label: string, part: 'body' | 'letters'): Promise<ArrayBuffer> {
  const factory = await load();
  const errors: string[] = [];
  // Silence stdout: without an explicit `print`, Emscripten's default writes OpenSCAD's
  // normal ECHO/status chatter to the browser console.
  const api = await factory({ printErr: (t) => errors.push(t), print: () => undefined });
  const instance = await api.getInstance();

  instance.FS.mkdir('/fonts');
  instance.FS.writeFile('/fonts/fonts.conf', fontConfig as string);
  instance.FS.writeFile(`/fonts/${FONT_FILE}`, fontData as Uint8Array);
  instance.ENV.FONTCONFIG_FILE = '/fonts/fonts.conf';
  instance.FS.writeFile('/card.scad', scadSource);

  try {
    instance.callMain([
      '/card.scad',
      '--enable',
      'textmetrics',
      '--backend',
      'Manifold',
      '--export-format',
      'binstl',
      '-D',
      `PART=${JSON.stringify(part)}`,
      '-D',
      `LABEL=${JSON.stringify(label)}`,
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

/**
 * OpenSCAD reports assert() failures on stderr; surface the message rather than a generic
 * failure. A compile-time assert line looks like:
 *   Assertion '<condition>' failed: "<message>" in file /card.scad, line 69
 * `<message>` is itself an OpenSCAD string (built with `str(...)` in nfc-keychain-card.scad) and
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
 */
export function createSerialQueue(): (id: number, task: () => Promise<void>) => void {
  let tail: Promise<void> = Promise.resolve();
  let latestId = 0;

  return (id, task) => {
    latestId = id;
    tail = tail
      .then(() => (id === latestId ? task() : undefined))
      // A rejection must not poison the chain for every later submission.
      .catch(() => undefined);
  };
}

const submit = createSerialQueue();

self.onmessage = (event: MessageEvent<RenderRequest>) => {
  const { id, label } = event.data;

  submit(id, async () => {
    try {
      const body = await renderPart(label, 'body');
      const letters = await renderPart(label, 'letters');
      const response: RenderResponse = { id, ok: true, body, letters };
      (self as unknown as Worker).postMessage(response, [body, letters]);
    } catch (error) {
      const response: RenderResponse = {
        id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
      (self as unknown as Worker).postMessage(response);
    }
  });
};
