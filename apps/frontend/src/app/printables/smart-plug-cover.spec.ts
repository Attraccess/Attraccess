// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseBinaryStl, type Mesh } from './stl';
import { boundingBox } from './testBoundingBox';

const PUBLIC_DIR = join(__dirname, '../../../public/openscad');
const SCAD = readFileSync(join(__dirname, 'smart-plug-cover.scad'), 'utf8');

interface OpenScadInstance {
  FS: { mkdir(path: string): void; writeFile(path: string, data: string | Uint8Array): void; readFile(path: string): Uint8Array; };
  ENV: Record<string, string>;
  callMain(args: string[]): void;
}

let createOpenSCAD: (options: Record<string, unknown>) => Promise<OpenScadInstance>;
let wasmModule: WebAssembly.Module;

beforeAll(async () => {
  const mod = await import(/* @vite-ignore */ pathToFileURL(join(PUBLIC_DIR, 'openscad.wasm.js')).href);
  createOpenSCAD = mod.default;
  wasmModule = await WebAssembly.compile(readFileSync(join(PUBLIC_DIR, 'openscad.wasm')));
});

async function render(part: 'body' | 'cover', device = 'nous_a1', cable = 'straight_schuko'): Promise<Mesh | null> {
  const instance = await createOpenSCAD({
    noInitialRun: true,
    print: () => undefined,
    printErr: () => undefined,
    instantiateWasm: (imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void) => {
      WebAssembly.instantiate(wasmModule, imports).then(done);
      return {};
    },
  });
  instance.FS.mkdir('/fonts');
  instance.FS.writeFile('/fonts/fonts.conf', readFileSync(join(PUBLIC_DIR, 'fonts/fonts.conf')));
  instance.FS.writeFile('/fonts/Sansation_Regular.ttf', readFileSync(join(PUBLIC_DIR, 'fonts/Sansation_Regular.ttf')));
  instance.ENV.FONTCONFIG_FILE = '/fonts/fonts.conf';
  instance.FS.writeFile('/cover.scad', SCAD);
  try {
    instance.callMain(['/cover.scad', '--enable', 'textmetrics', '--backend', 'Manifold', '--export-format', 'binstl', '-D', `PART=${JSON.stringify(part)}`, '-D', `DEVICE=${JSON.stringify(device)}`, '-D', `CABLE=${JSON.stringify(cable)}`, '-o', '/out.stl']);
  } catch { /* callMain exits the Emscripten runtime after rendering. */ }
  try {
    const data = instance.FS.readFile('/out.stl');
    return parseBinaryStl(new Uint8Array(data).buffer);
  } catch {
    return null;
  }
}

describe('smart-plug-cover.scad', () => {
  it('renders the reinforced Nous body and its non-overlapping cover', async () => {
    const [body, cover] = await Promise.all([render('body'), render('cover')]);
    expect(body).not.toBeNull();
    expect(cover).not.toBeNull();
    const bodyBox = boundingBox(body as Mesh);
    expect(bodyBox.min[2]).toBeCloseTo(0, 2);
    expect(bodyBox.max[2]).toBeCloseTo(33, 2);
    // The original Nous profile is Ø49.7 with attached 0.5 mm embossing.
    expect(bodyBox.max[0] - bodyBox.min[0]).toBeGreaterThanOrEqual(49.7);
    expect(bodyBox.max[0] - bodyBox.min[0]).toBeLessThanOrEqual(50.8);
    // The cover's Ø46 insertion skirt sits inside the upper body bore.
    expect(boundingBox(cover as Mesh).min[2]).toBeCloseTo(23, 2);
    expect(boundingBox(cover as Mesh).max[2]).toBeCloseTo(34.9, 2);
  }, 30_000);

  it('renders the Shelly profile with an angled Euro cable relief', async () => {
    expect(await render('body', 'shelly_plus', 'angled_euro')).not.toBeNull();
  }, 30_000);
});
