/// <reference lib="webworker" />
import scadSource from './nfc-keychain-card.scad?raw';

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
    throw new Error(assertionMessage(errors) ?? `OpenSCAD produced no output for part "${part}".`);
  }

  // Copy out of the wasm heap before the instance is collected.
  return new Uint8Array(data).buffer;
}

/** OpenSCAD reports assert() failures on stderr; surface the message rather than a generic failure. */
function assertionMessage(errors: string[]): string | null {
  const line = errors.find((e) => /Assertion .* failed/.test(e));
  if (!line) return null;
  const quoted = /failed:\s*"?(.*?)"?\s*$/.exec(line);
  return quoted?.[1] ?? line;
}

self.onmessage = async (event: MessageEvent<RenderRequest>) => {
  const { id, label } = event.data;
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
};
