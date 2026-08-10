// @vitest-environment node
//
// This spec loads the vendored openscad.js from the public dir and lets it
// resolve `new URL('./openscad.wasm', import.meta.url)` on its own. Under the
// project's default `happy-dom` environment, Vitest's browser-style asset
// transform rewrites literal `import.meta.url` occurrences to a dev-server
// URL (e.g. http://localhost:3000/...), which breaks the wasm's Node-file
// loading branch. Node's SSR transform leaves it as a real file:// URL.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseBinaryStl, type Mesh } from './stl';
import { boundingBox } from './testBoundingBox';

const PUBLIC_DIR = join(__dirname, '../../../public/openscad');
const SCAD = readFileSync(join(__dirname, 'nfc-keychain-card.scad'), 'utf8');

interface RenderResult {
  mesh: Mesh | null;
  errors: string[];
}

interface OpenScadFS {
  mkdir(path: string): void;
  writeFile(path: string, data: string | Uint8Array): void;
  readFile(path: string): Uint8Array;
}

interface OpenScadInstance {
  FS: OpenScadFS;
  ENV: Record<string, string>;
  callMain(args: string[]): void;
}

let createOpenSCAD: (options: Record<string, unknown>) => Promise<{ getInstance(): Promise<OpenScadInstance> }>;

beforeAll(async () => {
  const mod = await import(/* @vite-ignore */ pathToFileURL(join(PUBLIC_DIR, 'openscad.js')).href);
  ({ createOpenSCAD } = mod);
});

async function render(defines: Record<string, string | boolean>): Promise<RenderResult> {
  const errors: string[] = [];
  const api = await createOpenSCAD({ printErr: (t: string) => errors.push(t), print: () => undefined });
  const instance = await api.getInstance();

  instance.FS.mkdir('/fonts');
  instance.FS.writeFile('/fonts/fonts.conf', readFileSync(join(PUBLIC_DIR, 'fonts/fonts.conf')));
  instance.FS.writeFile(
    '/fonts/LiberationSans-Regular.ttf',
    readFileSync(join(PUBLIC_DIR, 'fonts/LiberationSans-Regular.ttf'))
  );
  instance.ENV.FONTCONFIG_FILE = '/fonts/fonts.conf';
  instance.FS.writeFile('/card.scad', SCAD);

  const args = ['/card.scad', '--enable', 'textmetrics', '--backend', 'Manifold', '--export-format', 'binstl'];
  for (const [key, value] of Object.entries(defines)) args.push('-D', `${key}=${JSON.stringify(value)}`);
  args.push('-o', '/out.stl');

  try {
    instance.callMain(args);
  } catch {
    // Emscripten tears the runtime down after callMain; output is already on the FS.
  }

  try {
    const data: Uint8Array = instance.FS.readFile('/out.stl');
    const copy = new Uint8Array(data); // detach from the wasm heap
    return { mesh: parseBinaryStl(copy.buffer), errors };
  } catch {
    return { mesh: null, errors };
  }
}

/** Z values of vertices lying on the pocket wall (radius 12.5 about the card centre). */
function pocketWallZ(mesh: Mesh): number[] {
  const found = new Set<number>();
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const [x, y, z] = [mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]];
    if (Math.abs(Math.hypot(x - 30, y - 20) - 12.5) < 0.05) found.add(Number(z.toFixed(3)));
  }
  return [...found].sort((a, b) => a - b);
}

describe('nfc-keychain-card.scad', () => {
  it('renders a body of exactly 60 x 40 x 2 mm', async () => {
    const { mesh } = await render({ PART: 'body', LABEL: 'Makerspace' });
    expect(mesh).not.toBeNull();

    const { min, max } = boundingBox(mesh as Mesh);
    expect(min[0]).toBeCloseTo(0, 3);
    expect(min[1]).toBeCloseTo(0, 3);
    expect(min[2]).toBeCloseTo(0, 3);
    expect(max[0]).toBeCloseTo(60, 3);
    expect(max[1]).toBeCloseTo(40, 3);
    expect(max[2]).toBeCloseTo(2, 3);
  }, 30_000);

  it('seals the NFC pocket between z=0.875 and z=1.125', async () => {
    const { mesh } = await render({ PART: 'body', LABEL: '' });
    expect(pocketWallZ(mesh as Mesh)).toEqual([0.875, 1.125]);
  }, 30_000);

  it('opens the pocket through the bottom face when POCKET_OPEN is set', async () => {
    const { mesh } = await render({ PART: 'body', LABEL: '', POCKET_OPEN: true });
    expect(pocketWallZ(mesh as Mesh)).toEqual([0, 1.125]);
  }, 30_000);

  it('keeps letters inside the text area and in the top 0.4 mm', async () => {
    const { mesh } = await render({ PART: 'letters', LABEL: 'Makerspace' });
    const { min, max } = boundingBox(mesh as Mesh);

    expect(min[0]).toBeGreaterThanOrEqual(3 - 0.01);
    expect(max[0]).toBeLessThanOrEqual(57 + 0.01);
    expect(max[1]).toBeLessThanOrEqual(37 + 0.01);
    expect(min[2]).toBeCloseTo(1.6, 3);
    expect(max[2]).toBeCloseTo(2, 3);
  }, 30_000);

  it('clamps a short label to the 10 mm maximum cap height', async () => {
    // "A7" would fill 54 mm at a far larger size; the clamp puts its cap box at y=15..25.
    const { mesh } = await render({ PART: 'letters', LABEL: 'A7' });
    expect(boundingBox(mesh as Mesh).min[1]).toBeCloseTo(15, 2);
  }, 30_000);

  it('renders the brand line alone when the label is empty', async () => {
    const { mesh } = await render({ PART: 'letters', LABEL: '' });
    expect((mesh as Mesh).triangleCount).toBeGreaterThan(0);
    expect(boundingBox(mesh as Mesh).max[1]).toBeCloseTo(37, 2);
  }, 30_000);

  it('rejects a label that cannot fit at the minimum cap height', async () => {
    const { mesh, errors } = await render({ PART: 'body', LABEL: 'A'.repeat(120) });
    expect(mesh).toBeNull();
    expect(errors.join('\n')).toMatch(/Label too long/);
  }, 30_000);
});
